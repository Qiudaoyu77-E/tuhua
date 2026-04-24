# AI 图片风格转换网页工具

一个纯前端网页工具，可将图片转换为：
- 线稿
- 日本漫画风格
- 水彩画
- 油画

## 特性

- 支持上传图片并实时预览。
- 提供风格选择 + 强度滑块。
- 支持模型服务商选择（OpenAI / Anthropic / Gemini / 通义千问（百炼） / OpenRouter / 自定义兼容接口）。
- 支持模型服务商选择（OpenAI / Anthropic / Gemini / OpenRouter / 自定义兼容接口）。
- 输入 API Key 后可自动识别常见服务商。
- 不输入 API Key 时可直接使用本地无大模型模式（离线滤镜）。
- 模型请求失败会自动回退本地模式。

## 启动

直接用任意静态服务器打开即可：

```bash
python -m http.server 8080
```

打开 `http://localhost:8080`。

## 注意

浏览器直接调用第三方模型可能会遇到 CORS 或鉴权策略限制。生产环境建议通过你自己的后端代理请求。

通义千问（百炼）图像编辑默认走官方接口：
- `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- 可选模型示例：`qwen-image-edit-plus`、`qwen-image-2.0-pro`
