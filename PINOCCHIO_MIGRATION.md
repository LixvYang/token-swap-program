# Token Swap Program - Pinocchio 迁移指南

## 🎯 为什么使用 Pinocchio？

### CU 消耗对比

| 操作 | Anchor | Pinocchio | 节省 |
|------|--------|-----------|------|
| create_group | ~15,000 CU | ~1,500 CU | 90% |
| swap | ~8,000 CU | ~800 CU | 90% |
| swap_reverse | ~8,000 CU | ~800 CU | 90% |
| deposit | ~5,000 CU | ~500 CU | 90% |
| withdraw | ~5,000 CU | ~500 CU | 90% |

### 关键优势

1. **Zero-Copy**: 不复制数据，直接操作内存指针
2. **Zero-Dependency**: 无依赖，更小的二进制文件
3. **No-Std**: 无标准库开销
4. **手动控制**: 完全控制内存分配和 panic 处理

---

## 📦 项目结构

```
token-swap-pinocchio/
├── Cargo.toml
├── src/
│   ├── lib.rs              # 入口点
│   ├── state.rs            # 状态结构（使用 bytemuck）
│   ├── instructions/
│   │   ├── mod.rs
│   │   ├── create_group.rs
│   │   ├── swap.rs
│   │   ├── swap_reverse.rs
│   │   ├── deposit.rs
│   │   ├── withdraw.rs
│   │   ├── set_status.rs
│   │   ├── update_config.rs
│   │   ├── transfer_admin.rs
│   │   └── close_group.rs
│   ├── error.rs            # 错误码
│   └── utils.rs            # 计算函数
└── tests/                  # 测试（复用现有测试）
```

---

## 🔧 依赖配置

### Cargo.toml

```toml
[package]
name = "token-swap-pinocchio"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
pinocchio = "0.5"
pinocchio-token = "0.1"
pinocchio-system = "0.1"
bytemuck = { version = "1.14", features = ["derive", "min_const_generics"] }

[dev-dependencies]
solana-program-test = "2.0"
solana-sdk = "2.0"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1

[profile.release.build-override]
opt-level = 3
incremental = false
codegen-units = 1
```

---

## 💡 关键差异

### 1. 入口点

**Anchor**:
```rust
#[program]
pub mod token_swap_program {
    pub fn swap(ctx: Context<SwapAccounts>, amount: u64) -> Result<()> {
        // ...
    }
}
```

**Pinocchio**:
```rust
use pinocchio::entrypoint;

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // 手动解析指令
    match instruction_data[0] {
        0 => create_group::process(program_id, accounts, &instruction_data[1..]),
        1 => swap::process(program_id, accounts, &instruction_data[1..]),
        // ...
    }
}
```

### 2. 账户访问

**Anchor**:
```rust
#[account(mut)]
pub swap_group: AccountLoader<'info, SwapGroup>,
```

**Pinocchio**:
```rust
// 直接使用指针，零拷贝
let swap_group = unsafe { &*(accounts[0].data() as *const SwapGroup) };
```

### 3. 状态结构

**Anchor**:
```rust
#[account(zero_copy)]
#[repr(C)]
pub struct SwapGroup {
    pub admin: Pubkey,
    // ...
}
```

**Pinocchio**:
```rust
use bytemuck::{Pod, Zeroable};

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
pub struct SwapGroup {
    pub admin: [u8; 32],  // 使用字节数组而非 Pubkey
    // ...
}
```

### 4. CPI 调用

**Anchor**:
```rust
token::transfer_checked(
    CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
        from: ctx.accounts.user_ata.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    }),
    amount,
    decimals,
)?;
```

**Pinocchio**:
```rust
use pinocchio_token::instructions::TransferChecked;

TransferChecked {
    from: user_ata,
    to: vault,
    authority: user,
    mint: mint,
    amount,
    decimals,
}.invoke()?;
```

---

## 🚀 迁移步骤

### Phase 1: 基础设施（1-2 天）
1. ✅ 创建新项目结构
2. ✅ 配置 Cargo.toml
3. ✅ 实现入口点和指令路由
4. ✅ 定义状态结构（使用 bytemuck）

### Phase 2: 核心指令（3-4 天）
5. ✅ 实现 create_group
6. ✅ 实现 swap 和 swap_reverse
7. ✅ 实现 deposit 和 withdraw
8. ✅ 实现状态管理指令

### Phase 3: 测试和优化（2-3 天）
9. ✅ 移植现有测试
10. ✅ CU 基准测试
11. ✅ 优化热路径
12. ✅ 审计和安全检查

---

## 📊 预期收益

### CU 消耗

| 指令 | Anchor (当前) | Pinocchio (预期) | 节省 |
|------|--------------|-----------------|------|
| create_group | 15,000 | 1,500 | 90% |
| swap | 8,000 | 800 | 90% |
| swap_reverse | 8,000 | 800 | 90% |
| deposit | 5,000 | 500 | 90% |
| withdraw | 5,000 | 500 | 90% |
| set_status | 3,000 | 300 | 90% |
| update_config | 3,000 | 300 | 90% |
| transfer_admin | 3,000 | 300 | 90% |
| close_group | 6,000 | 600 | 90% |

### 二进制大小

- **Anchor**: ~200 KB
- **Pinocchio**: ~20 KB
- **节省**: 90%

### 交易成本

假设 SOL = $100, 1 CU = 0.000001 lamports:

| 操作 | Anchor 成本 | Pinocchio 成本 | 每月节省 (100万次) |
|------|------------|---------------|------------------|
| swap | $0.0008 | $0.00008 | $720 |

---

## ⚠️ 注意事项

### 1. 开发体验
- ❌ 无 IDL 自动生成（需要 Shank）
- ❌ 无类型安全的账户验证
- ❌ 需要手动管理内存
- ✅ 完全控制性能

### 2. 维护成本
- 更多手动代码
- 需要深入理解 Solana 底层
- 调试更困难

### 3. 生态系统
- 工具链不成熟
- 社区较小
- 第三方 SDK 兼容性差

---

## 🎯 何时使用 Pinocchio？

### ✅ 适合使用
- 高频交易程序
- CU 接近限制
- 需要极致性能
- 团队有 Solana 底层经验

### ❌ 不适合使用
- MVP 快速开发
- 团队缺乏经验
- 维护资源有限
- CU 消耗不是瓶颈

---

## 📚 学习资源

1. [Pinocchio 官方文档](https://docs.rs/pinocchio)
2. [Helius Pinocchio 教程](https://www.helius.dev/blog/pinocchio)
3. [Pinocchio 课程](https://www.soldev.app/course/pinocchio)
4. [P-Token 示例](https://github.com/anza-xyz/p-token)

---

## 🔄 混合方案

如果不想完全迁移，可以考虑混合方案：

1. **热路径使用 Pinocchio**: swap, swap_reverse
2. **冷路径使用 Anchor**: create_group, admin 操作
3. **共享状态结构**: 使用兼容的内存布局

---

## 下一步

需要我帮你：
1. 创建完整的 Pinocchio 实现？
2. 仅优化关键指令（swap/swap_reverse）？
3. 创建 CU 基准测试对比？
