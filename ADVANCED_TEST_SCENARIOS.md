# Token Swap Program - 高级测试场景分析

## 🎯 Decimals 测试覆盖

### 已实现的测试场景

#### 场景 1: 高精度 → 低精度（9 → 2 decimals）
**模拟**: SOL → USDC
- ✅ 1 SOL → 100 USDC
- ✅ 0.5 SOL → 50 USDC（小数处理）
- ✅ 0.001 SOL → 0.1 USDC（精度损失）

**测试要点**:
- 精度下降时的舍入行为
- 小数值兑换的正确性
- 防止精度损失导致的错误

#### 场景 2: 低精度 → 高精度（2 → 9 decimals）
**模拟**: USDC → SOL
- ✅ 100 USDC → 1 SOL
- ✅ 1 USDC → 0.01 SOL

**测试要点**:
- 精度扩展的正确性
- 小数值放大计算

#### 场景 3: 极端精度差异（0 → 9 decimals）
**模拟**: NFT → Token
- ✅ 1 NFT → 1000 tokens

**测试要点**:
- 最大精度差异（9 级）
- 整数到高精度的转换

#### 场景 4: rate_decimals 的使用
**模拟**: 小数比例（1.5x, 0.123x）
- ✅ rate=15, rate_decimals=1 → 1.5x
- ✅ rate=123, rate_decimals=3 → 0.123x

**测试要点**:
- rate_decimals 参数的正确性
- 复杂比例计算

#### 场景 5: 精度损失和舍入
**模拟**: 9 → 2 decimals with odd numbers
- ✅ 1 lamport 兑换（最小单位）
- ✅ 奇数除法（333_333_333 / 3）

**测试要点**:
- 除法舍入行为（向下取整）
- 最小单位兑换结果

#### 场景 6: 手续费与 decimals 交互
**模拟**: 9 → 6 decimals with 5% fee
- ✅ 1 token → 0.95 token（含手续费）
- ✅ 0.01 token → 0.0095 token（小数值含手续费）

**测试要点**:
- 手续费在不同精度下的计算
- 手续费舍入行为

#### 场景 7: 反向兑换的 decimals
**模拟**: 6 → 9 decimals reverse swap
- ✅ 0.01 SOL → 1 USDC（反向）
- ✅ Round-trip 一致性测试

**测试要点**:
- 反向兑换公式的正确性
- 往返兑换的精度损失

#### 场景 8: 极端数值
**模拟**: 大数值兑换
- ✅ 10 亿 tokens 兑换

**测试要点**:
- 大数值不溢出
- u128 中间计算的正确性

#### 场景 9: 真实世界代币对
**模拟**: 
- ✅ SOL/USDC (9/6) - 1 SOL = 150 USDC, 0.3% fee
- ✅ BTC/ETH (8/18) - 1 BTC = 15 ETH

**测试要点**:
- 真实市场比例
- 真实手续费率
- 真实精度组合

---

## 🔍 更多可测试的内容

### 1. 边界值测试

#### 最小值测试
- ⚠️ **1 lamport 兑换在所有 decimals 组合下的行为**
  - 0→0, 0→6, 0→9
  - 6→0, 6→6, 6→9
  - 9→0, 9→6, 9→9
- ⚠️ **最小可兑换数量**（结果 > 0 的最小输入）
- ⚠️ **精度损失导致结果为 0 的情况**

#### 最大值测试
- ⚠️ **接近 u64::MAX 的兑换**（~18.4 quintillion）
- ⚠️ **u128 中间计算的溢出边界**
- ⚠️ **最大 swap_rate 值测试**

### 2. 数学正确性测试

#### 可逆性测试
- ⚠️ **swap → swap_reverse 往返测试**（所有 decimals 组合）
- ⚠️ **精度损失量化**（往返后的差异应 < 1 lamport）
- ⚠️ **含手续费的往返测试**（验证手续费不会累积误差）

#### 不变量测试
- ⚠️ **总供应量守恒**（vault_in + vault_out + user_balances = constant）
- ⚠️ **手续费累积验证**（所有手续费应留在 vault 中）
- ⚠️ **比例一致性**（forward 和 reverse 应互为倒数）

### 3. 精度组合矩阵

完整的 decimals 组合测试（10x10 矩阵）:

| Input\Output | 0 | 2 | 6 | 8 | 9 | 18 |
|--------------|---|---|---|---|---|----|
| **0**        | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| **2**        | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| **6**        | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| **8**        | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| **9**        | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| **18**       | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

**建议**: 至少测试常见组合（0,2,6,8,9）

### 4. rate_decimals 组合测试

| rate_decimals | swap_rate | 实际比例 | 测试状态 |
|---------------|-----------|---------|---------|
| 0 | 1 | 1:1 | ✅ |
| 0 | 100 | 100:1 | ✅ |
| 1 | 15 | 1.5:1 | ✅ |
| 2 | 1 | 0.01:1 | ✅ |
| 3 | 123 | 0.123:1 | ✅ |
| 4 | 12345 | 1.2345:1 | ⚠️ |
| 6 | 1 | 0.000001:1 | ⚠️ |
| 9 | 1 | 0.000000001:1 | ⚠️ |

### 5. 手续费边界测试

- ✅ 0 bps (0%)
- ✅ 30 bps (0.3%)
- ✅ 100 bps (1%)
- ✅ 500 bps (5%)
- ⚠️ 1000 bps (10%)
- ⚠️ 5000 bps (50%)
- ⚠️ 9999 bps (99.99%)
- ⚠️ 10000 bps (100%) - 应该拒绝
- ⚠️ 10001 bps - 应该拒绝

### 6. 组合场景测试

#### 极端组合
- ⚠️ **最高精度 + 最高费率 + 最大数值**
  - 18 decimals, 9999 bps fee, large amount
- ⚠️ **最低精度 + 最小比例 + 最小数值**
  - 0 decimals, rate=1/rate_decimals=9, amount=1
- ⚠️ **不对称精度 + 复杂比例**
  - 8→18 decimals, rate=12345/rate_decimals=4

#### 真实场景
- ✅ SOL/USDC (9/6)
- ✅ BTC/ETH (8/18)
- ⚠️ USDT/USDC (6/6) - 稳定币对
- ⚠️ mSOL/SOL (9/9) - 质押代币
- ⚠️ Wrapped tokens (9/9) - 包装代币

### 7. 错误场景测试

#### 精度相关错误
- ⚠️ **结果为 0 的兑换**（输入太小）
- ⚠️ **溢出检测**（中间计算超过 u128）
- ⚠️ **除零保护**（swap_rate=0 在不同 decimals 下）

#### 余额不足场景
- ⚠️ **Vault 余额刚好不足 1 lamport**
- ⚠️ **手续费导致 Vault 不足**
- ⚠️ **大数值兑换超过 Vault 容量**

### 8. 性能和 Gas 测试

- ⚠️ **不同 decimals 的 CU 消耗对比**
- ⚠️ **Zero-copy 的性能优势验证**
- ⚠️ **大数值计算的 CU 消耗**

### 9. 并发和竞态测试

- ⚠️ **多用户同时兑换相同 SwapGroup**
- ⚠️ **Admin 更新配置时用户兑换**
- ⚠️ **Vault 余额竞争**

### 10. 状态转换测试

- ⚠️ **Active → Paused → Active 循环**
- ⚠️ **Paused 状态下的 deposit/withdraw**
- ⚠️ **Closed 状态的不可逆性**

---

## 📊 测试覆盖统计

### 当前覆盖
- ✅ **基础功能**: 21 个测试用例
- ✅ **Decimals 场景**: 12 个测试用例
- ✅ **属性测试**: 3 个（300 随机用例）
- **总计**: 33 个集成测试 + 300 个属性测试

### 建议补充（优先级排序）

#### 🔴 高优先级（必须测试）
1. **完整的 decimals 矩阵**（至少 0,2,6,9 组合）
2. **往返一致性测试**（所有 decimals 组合）
3. **最小/最大值边界测试**
4. **手续费边界测试**（0, 9999, 10000, 10001 bps）
5. **溢出保护验证**

#### 🟡 中优先级（推荐测试）
6. **真实代币对场景**（USDT/USDC, mSOL/SOL）
7. **精度损失量化**
8. **Vault 余额不足的边界情况**
9. **并发兑换测试**
10. **状态转换完整性**

#### 🟢 低优先级（可选测试）
11. **CU 消耗分析**
12. **极端 rate_decimals 测试**（6-9）
13. **18 decimals 代币测试**
14. **性能基准测试**

---

## 🧪 推荐的测试策略

### 策略 1: 参数化测试（推荐）
使用循环生成所有 decimals 组合:

```typescript
const DECIMALS = [0, 2, 6, 8, 9];
for (const inputDec of DECIMALS) {
  for (const outputDec of DECIMALS) {
    it(`should swap ${inputDec}→${outputDec} decimals`, async () => {
      // Test logic
    });
  }
}
```

### 策略 2: 属性测试（Rust）
在 Rust 中使用 proptest 生成随机参数:

```rust
proptest! {
    #[test]
    fn prop_all_decimals_combinations(
        amount_in in 1u64..1_000_000_000u64,
        input_decimals in 0u8..10u8,
        output_decimals in 0u8..10u8,
        swap_rate in 1u64..1_000_000u64,
        rate_decimals in 0u8..6u8,
        fee_bps in 0u16..10000u16,
    ) {
        // Verify no overflow and result is reasonable
    }
}
```

### 策略 3: 快照测试
记录已知输入的预期输出，防止回归:

```typescript
const KNOWN_CASES = [
  { input: "1000000000", expected: "10000", desc: "1 SOL → 100 USDC" },
  { input: "10000", expected: "1000000000", desc: "100 USDC → 1 SOL" },
  // ... more cases
];
```

---

## 🐛 已发现的潜在问题

### 1. 精度损失问题
**场景**: 1 lamport (9 decimals) → 2 decimals
- 可能结果为 0
- **建议**: 添加最小兑换数量检查

### 2. 舍入方向
**场景**: 所有除法都向下取整
- 可能对用户不利
- **建议**: 文档说明舍入策略

### 3. 溢出风险
**场景**: 大数值 * 大比例 * 高精度
- u128 中间计算可能溢出
- **建议**: 添加更多边界测试

### 4. 手续费精度
**场景**: 小数值兑换的手续费可能为 0
- 1000 * 30 / 10000 = 3（但可能舍入为 0）
- **建议**: 测试最小手续费场景

---

## 📝 测试执行计划

### Phase 1: 基础覆盖（已完成）
- ✅ 所有指令的正向测试
- ✅ 关键错误路径
- ✅ 基本 decimals 场景

### Phase 2: Decimals 深度测试（当前）
- ✅ 9 个 decimals 场景
- ⚠️ 完整矩阵测试（待补充）
- ⚠️ 往返一致性（待补充）

### Phase 3: 边界和极端测试（建议）
- ⚠️ 最小/最大值
- ⚠️ 溢出保护
- ⚠️ 精度损失量化

### Phase 4: 性能和并发（可选）
- ⚠️ CU 消耗分析
- ⚠️ 并发测试
- ⚠️ 压力测试

---

## 🚀 运行测试

### 运行所有测试
```bash
anchor test
```

### 仅运行 decimals 测试
```bash
anchor test --skip-deploy -- --grep "Decimals Edge Cases"
```

### 运行特定场景
```bash
anchor test --skip-deploy -- --grep "Scenario 1"
```

### 运行 Rust 属性测试
```bash
cargo test --manifest-path programs/token-swap-program/Cargo.toml
```

---

## 📈 测试质量指标

| 指标 | 当前值 | 目标值 | 状态 |
|------|--------|--------|------|
| 指令覆盖率 | 100% (9/9) | 100% | ✅ |
| Decimals 组合 | 30% (9/30) | 80% | 🟡 |
| 边界值测试 | 40% | 90% | 🟡 |
| 错误路径 | 80% | 95% | ✅ |
| 往返一致性 | 20% | 100% | 🔴 |
| 并发测试 | 0% | 50% | 🔴 |

---

## 💡 关键发现

### 数学公式验证
正向兑换公式:
```
amount_out = amount_in * swap_rate * 10^output_decimals 
             / (10^rate_decimals * 10^input_decimals)
```

反向兑换公式:
```
amount_out = amount_in * 10^rate_decimals * 10^input_decimals 
             / (swap_rate * 10^output_decimals)
```

### 关键测试点
1. **精度转换**: 10^decimals 的幂运算不溢出
2. **中间计算**: 使用 u128 防止溢出
3. **舍入行为**: 整数除法向下取整
4. **手续费顺序**: 先计算 amount_out，再扣除手续费

---

## 🎯 下一步建议

### 立即执行
1. ✅ 运行现有测试验证基础功能
2. ⚠️ 补充完整的 decimals 矩阵测试
3. ⚠️ 添加往返一致性测试

### 短期目标
4. ⚠️ 边界值测试（最小/最大）
5. ⚠️ 溢出保护验证
6. ⚠️ 手续费边界测试

### 长期目标
7. ⚠️ 并发测试
8. ⚠️ 性能基准
9. ⚠️ 模糊测试（fuzzing）

---

## 📚 参考资料

### Solana Token Decimals
- SOL: 9 decimals
- USDC: 6 decimals
- USDT: 6 decimals
- BTC (wrapped): 8 decimals
- ETH (wrapped): 18 decimals
- NFT: 0 decimals

### 手续费参考
- Uniswap: 30 bps (0.3%)
- Raydium: 25 bps (0.25%)
- Orca: 30 bps (0.3%)
- Jupiter: 动态费率

### 测试最佳实践
1. 使用真实的 decimals 值
2. 测试边界条件
3. 验证数学不变量
4. 记录精度损失
5. 测试往返一致性
