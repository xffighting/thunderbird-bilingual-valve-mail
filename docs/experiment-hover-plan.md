# 邮件列表标题悬浮方案

## 背景

标准 MailExtension API 能读取邮件和会话内容，也能在工具栏按钮或邮件查看界面展示弹窗。它没有公开的 message list subject hover API。邮件列表 subject 行属于 Thunderbird 内部 `about3Pane` 页面，真实标题悬浮需要 Experiment API。

## 推荐路径

1. 先使用当前标准扩展作为 MVP。
2. 收集用户对摘要字段和匹配准确率的反馈。
3. 明确目标 Thunderbird 版本，例如 128 ESR 或 140 ESR。
4. 再开发 Experiment 版，把 tooltip 绑定到 `about3Pane` 的 `#threadTree` 和 subject 单元格。

## Experiment 设计草案

目录结构建议：

```text
experiment/
  api/hoverSummary/schema.json
  api/hoverSummary/implementation.js
  api/hoverSummary/child.js
```

API 形态建议：

```json
[
  {
    "namespace": "hoverSummary",
    "functions": [
      {
        "name": "install",
        "type": "function",
        "parameters": []
      },
      {
        "name": "uninstall",
        "type": "function",
        "parameters": []
      }
    ]
  }
]
```

内部逻辑建议：

- 遍历 Thunderbird 三栏主窗口。
- 找到 `about3Pane` 文档。
- 在 `#threadTree` 上监听 `mouseover` 和 `focusin`。
- 命中 `.subjectcol-column .subject-line` 后定位所在行。
- 从所在行取得对应 message key 或 message URI。
- 调用扩展侧摘要缓存，得到多行文本。
- 写入 subject 节点的 `title` 属性，或渲染一个轻量 tooltip 节点。
- 在 `onShutdown` 中移除事件监听器和 tooltip 节点。

## 风险

- Experiment API 会触发 Thunderbird 对用户显示“full unrestricted access”级别的权限提示。
- 内部 DOM 结构可能随 Thunderbird 版本变动。
- message row 到 message id 的映射需要按目标版本验证。
- 建议把 Experiment 版和标准版分开打包，避免 MVP 安装权限过宽。
