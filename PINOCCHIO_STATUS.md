# Pinocchio 实现状态

## ✅ 已完成

### 1. 项目结构
- ✅ Cargo.toml 配置
- ✅ 工作区集成
- ✅ 依赖管理（pinocchio 0.6, pinocchio-token 0.1, pinocchio-system 0.5）

### 2. 核心模块
- ✅ `src/lib.rs` - 入口点和指令路由
- ✅ `src/state.rs` - SwapGroup 状态结构（使用 bytemuck）
- ✅ `src/error.rs` - 错误码定义
- ✅ `src/utils.rs` - 计算函数和 PDA 验证

### 3. 指令实现（9个）
- ✅ `src/instructions/swap.rs` - 正向兑换
- ✅ `src/instructions/swap_reverse.rs` - 反向兑换
- ✅ `src/instructions/deposit.rs` - 存入 OutputToken
- ✅ `src/instructions/withdraw.rs` - 提取 OutputToken
- ✅ `src/instructions/set_status.rs` - 设置状态（pause/resume）
- ✅ `src/instructions/update_config.rs` - 更新配置
- ✅ `src/instructions/transfer_admin.rs` - 转移管理员
- ✅ `src/instructions/close_group.rs` - 关闭组并退还余额
- ⚠️ `src/instructions/create_group.rs` - 创建组（有编译错误）

## ⚠️ 当前问题

### 1. API 版本兼容性
- pinocchio 0.6 的 API 与 pinocchio-token 0.1 和 pinocchio-system 0.5 存在版本冲突
- `invoke_signed` 的签名格式在不同版本间有变化
- `InitilizeAccount3` 的字段名称与预期不符

### 2. create_group.rs 编译错误
```rust
// 错误 1: Pubkey::find_program_address 不存在
// 需要使用其他方式派生 PDA

// 错误 2: invoke_signed 签名不匹配
// 期望 Signer<'_, '_>，实际传入 &[&[u8]]

// 错误 3: InitilizeAccount3 字段名
// 期望 token/owner，实际使用 account/authority
```

### 3. 依赖版本冲突
- pinocchio-system 0.5 依赖 pinocchio 0.5
- pinocchio-token 0.1 依赖 pinocchio 0.6
- 导致类型不匹配错误

## 🔧 需要修复的问题

### 优先级 1：修复 create_group.rs
1. 使用 pinocchio 0.6 的正确 PDA 派生方法
2. 修复 invoke_signed 的调用方式
3. 修复 InitilizeAccount3 的字段名称
4. 或者直接使用底层的 invoke/invoke_signed API

### 优先级 2：统一依赖版本
1. 等待 pinocchio-system 更新到 0.6 兼容版本
2. 或者暂时移除 pinocchio-system 依赖，手动实现 CreateAccount CPI
3. 验证 pinocchio-token 0.1 与 pinocchio 0.6 的兼容性

### 优先级 3：完整测试
1. 移植现有的 Anchor 测试到 Pinocchio
2. 运行 CU 基准测试
3. 验证功能正确性

## 📊 预期收益

根据 CU_BENCHMARK.md 的分析：

| 指令 | Anchor CU | Pinocchio CU (预期) | 节省 |
|------|-----------|-------------------|------|
| swap | 8,000 | 800 | 90% |
| swap_reverse | 8,000 | 800 | 90% |
| create_group | 15,000 | 1,500 | 90% |
| deposit | 5,000 | 500 | 90% |
| withdraw | 5,000 | 500 | 90% |

**月度成本节省**（100万次交易）：~$2,475

## 🎯 下一步行动

### 方案 A：完整修复（推荐）
1. 研究 pinocchio 0.6 的正确 API 用法
2. 修复 create_group.rs 的所有编译错误
3. 运行完整测试套件
4. 进行 CU 基准测试

### 方案 B：简化实现
1. 暂时移除 create_group 指令
2. 专注于核心的 swap/swap_reverse 指令
3. 验证 CU 节省效果
4. 后续再补充完整功能

### 方案 C：混合方案
1. 保留 Anchor 版本用于生产
2. Pinocchio 版本仅用于高频指令（swap/swap_reverse）
3. 逐步迁移其他指令

## 📚 参考资源

1. [Pinocchio 官方文档](https://docs.rs/pinocchio)
2. [Helius Pinocchio 教程](https://www.helius.dev/blog/pinocchio)
3. [P-Token 示例](https://github.com/anza-xyz/p-token)
4. [Pinocchio 课程](https://www.soldev.app/course/pinocchio)

## 💡 建议

鉴于当前的 API 兼容性问题和 Pinocchio 生态系统的不成熟，建议：

1. **短期**：继续使用 Anchor 版本进行生产部署
2. **中期**：关注 Pinocchio 生态系统的更新，等待依赖库稳定
3. **长期**：当 CU 成为瓶颈时，再考虑完整迁移到 Pinocchio

当前的 Pinocchio 实现已经完成了 90%，主要卡在 create_group 指令的 CPI 调用上。这个问题可以通过以下方式解决：
- 等待 pinocchio-system 更新
- 手动实现 System Program CPI
- 使用 Pinocchio 的底层 invoke API

---

**最后更新**: 2026-03-26
**状态**: 开发中，等待 API 兼容性问题解决
