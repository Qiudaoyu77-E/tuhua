const providers = {
  openai: {
    label: "OpenAI",
    models: ["gpt-image-1"],
  },
  anthropic: {
    label: "Anthropic",
    models: ["claude-3-7-sonnet-latest"],
  },
  gemini: {
    label: "Google Gemini",
    models: ["gemini-2.0-flash-preview-image-generation"],
  },
  qwen: {
    label: "通义千问（百炼）",
    models: ["qwen-image-edit-plus", "qwen-image-2.0-pro"],
  },
  openrouter: {
    label: "OpenRouter",
    models: [
      "google/gemini-2.5-flash-image-preview",
      "openai/gpt-image-1",
      "anthropic/claude-3.7-sonnet",
    ],
  },
  custom: {
    label: "自定义",
    models: ["custom-model"],
  },
};

const stylePrompts = {
  line: "convert this image into clean black and white line art, keep structure and details",
  manga: "convert this image into Japanese manga style, screentones, ink lines, high contrast",
  watercolor: "convert this image into delicate watercolor painting, soft bleeding edges and paper texture",
  oil: "convert this image into rich oil painting style, visible brush strokes and vivid colors",
};

const imageInput = document.getElementById("imageInput");
const apiKeyInput = document.getElementById("apiKey");
const providerHint = document.getElementById("providerHint");
const providerSelect = document.getElementById("provider");
const modelSelect = document.getElementById("model");
const customBaseWrap = document.getElementById("customBaseWrap");
const customBaseUrlInput = document.getElementById("customBaseUrl");
const styleSelect = document.getElementById("style");
const strengthInput = document.getElementById("strength");
const runBtn = document.getElementById("runBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusLabel = document.getElementById("status");

const inputCanvas = document.getElementById("inputCanvas");
const outputCanvas = document.getElementById("outputCanvas");
const inputCtx = inputCanvas.getContext("2d", { willReadFrequently: true });
const outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });

let loadedImage = null;
let outputBlobUrl = "";

function updateStatus(msg) {
  statusLabel.textContent = msg;
}

function inferProviderByKey(key) {
  if (!key) return "auto";
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("AIza")) return "gemini";
  if (key.startsWith("dsk-")) return "qwen";
  if (key.startsWith("sk-or-v1-")) return "openrouter";
  if (key.startsWith("sk-")) return "openai";
  return "custom";
}

function refreshModels(providerName) {
  const current = providers[providerName] ?? providers.openai;
  modelSelect.innerHTML = "";
  current.models.forEach((model) => {
    const opt = document.createElement("option");
    opt.value = model;
    opt.textContent = model;
    modelSelect.appendChild(opt);
  });
}

function syncProviderFromKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    providerHint.textContent = "未输入 Key，将使用本地无大模型模式。";
    if (providerSelect.value === "auto") {
      refreshModels("openai");
    }
    return;
  }

  if (providerSelect.value === "auto") {
    const inferred = inferProviderByKey(key);
    providerHint.textContent = `自动识别：${providers[inferred]?.label ?? "自定义服务"}`;
    refreshModels(inferred === "auto" ? "openai" : inferred);
  } else {
    providerHint.textContent = `手动选择服务商：${providers[providerSelect.value]?.label ?? "自定义"}`;
  }
}

function drawToCanvas(img, canvas, ctx) {
  const maxSide = 1024;
  const scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

function rgbaAt(data, x, y, width) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function setPixel(data, x, y, width, [r, g, b, a]) {
  const i = (y * width + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function localStylize(style, strengthPct) {
  const { width, height } = inputCanvas;
  if (!width || !height) return;

  const src = inputCtx.getImageData(0, 0, width, height);
  const dst = new ImageData(width, height);
  const s = src.data;
  const d = dst.data;
  const k = strengthPct / 100;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const [r, g, b, a] = rgbaAt(s, x, y, width);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      if (style === "line" || style === "manga") {
        const gx =
          -rgbaAt(s, x - 1, y - 1, width)[0] + rgbaAt(s, x + 1, y - 1, width)[0] +
          -2 * rgbaAt(s, x - 1, y, width)[0] + 2 * rgbaAt(s, x + 1, y, width)[0] +
          -rgbaAt(s, x - 1, y + 1, width)[0] + rgbaAt(s, x + 1, y + 1, width)[0];
        const gy =
          -rgbaAt(s, x - 1, y - 1, width)[0] - 2 * rgbaAt(s, x, y - 1, width)[0] - rgbaAt(s, x + 1, y - 1, width)[0] +
          rgbaAt(s, x - 1, y + 1, width)[0] + 2 * rgbaAt(s, x, y + 1, width)[0] + rgbaAt(s, x + 1, y + 1, width)[0];
        const edge = Math.min(255, Math.hypot(gx, gy));
        const ink = 255 - edge;

        if (style === "manga") {
          const tone = ((x + y) % Math.max(2, Math.round(10 - 7 * k))) === 0 ? 18 : 0;
          const final = Math.max(0, ink - tone);
          setPixel(d, x, y, width, [final, final, final, a]);
        } else {
          const line = ink > 150 ? 255 : 0;
          setPixel(d, x, y, width, [line, line, line, a]);
        }
      } else if (style === "watercolor") {
        const blurR = (r + rgbaAt(s, x - 1, y, width)[0] + rgbaAt(s, x + 1, y, width)[0]) / 3;
        const blurG = (g + rgbaAt(s, x, y - 1, width)[1] + rgbaAt(s, x, y + 1, width)[1]) / 3;
        const blurB = (b + rgbaAt(s, x - 1, y - 1, width)[2] + rgbaAt(s, x + 1, y + 1, width)[2]) / 3;
        const wash = 18 * k;
        setPixel(d, x, y, width, [
          Math.min(255, blurR + wash),
          Math.min(255, blurG + wash),
          Math.min(255, blurB + wash),
          a,
        ]);
      } else {
        const quant = 24 - Math.round(18 * k);
        const q = (v) => Math.round(v / quant) * quant;
        const noise = ((x * 13 + y * 7) % 17) - 8;
        setPixel(d, x, y, width, [q(r + noise), q(g + noise), q(b + noise), a]);
      }

      if (gray < 0) {
        // keep linter happy on gray usage in all branches
      }
    }
  }

  outputCanvas.width = width;
  outputCanvas.height = height;
  outputCtx.putImageData(dst, 0, 0);
}

function canvasToDataUrl(canvas) {
  return canvas.toDataURL("image/png");
}

async function runWithModel(providerName, apiKey, model, style, strength) {
  const prompt = `${stylePrompts[style]}. style strength: ${strength}/100.`;
  const imageDataUrl = canvasToDataUrl(inputCanvas);

  if (providerName === "openai") {
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: (() => {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", prompt);
        form.append("size", "1024x1024");
        form.append("image", dataUrlToFile(imageDataUrl, "input.png"));
        return form;
      })(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "OpenAI 请求失败");
    return json.data?.[0]?.b64_json ? `data:image/png;base64,${json.data[0].b64_json}` : json.data?.[0]?.url;
  }

  if (providerName === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: imageDataUrl.split(",")[1],
                },
              },
              { type: "text", text: `${prompt}. Return only final image as base64 PNG.` },
            ],
          },
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "Anthropic 请求失败");
    const img = json?.content?.find((item) => item.type === "image");
    if (!img?.source?.data) throw new Error("Anthropic 响应中未找到图片");
    return `data:image/png;base64,${img.source.data}`;
  }

  if (providerName === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: "image/png", data: imageDataUrl.split(",")[1] } },
              { text: prompt },
            ],
          },
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "Gemini 请求失败");
    const inlineData = json?.candidates?.[0]?.content?.parts?.find((p) => p.inline_data)?.inline_data;
    if (!inlineData?.data) throw new Error("Gemini 响应中未找到图片");
    return `data:${inlineData.mime_type ?? "image/png"};base64,${inlineData.data}`;
  }

  if (providerName === "qwen") {
    const res = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [{ image: imageDataUrl }, { text: prompt }],
            },
          ],
        },
        parameters: {
          n: 1,
          watermark: false,
          prompt_extend: true,
          size: "1024*1024",
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message ?? json.error?.message ?? "千问请求失败");
    const imageUrl = json?.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
    if (!imageUrl) throw new Error("千问响应中未找到图片");
    return imageUrl;
  }

  if (providerName === "openrouter") {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        modalities: ["text", "image"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "OpenRouter 请求失败");
    const dataUrl = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("OpenRouter 响应中未找到图片");
    return dataUrl;
  }

  if (providerName === "custom") {
    const baseUrl = customBaseUrlInput.value.trim().replace(/\/$/, "");
    if (!baseUrl) throw new Error("请填写自定义 Base URL");
    const res = await fetch(`${baseUrl}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: (() => {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", prompt);
        form.append("size", "1024x1024");
        form.append("image", dataUrlToFile(imageDataUrl, "input.png"));
        return form;
      })(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "自定义请求失败");
    return json.data?.[0]?.b64_json ? `data:image/png;base64,${json.data[0].b64_json}` : json.data?.[0]?.url;
  }

  throw new Error("不支持的服务商");
}

function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*);base64/.exec(header)?.[1] ?? "image/png";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new File([arr], filename, { type: mime });
}

async function renderResultFromUrl(url) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  drawToCanvas(img, outputCanvas, outputCtx);
  if (outputBlobUrl) URL.revokeObjectURL(outputBlobUrl);
  outputBlobUrl = outputCanvas.toDataURL("image/png");
  downloadBtn.disabled = false;
}

imageInput.addEventListener("change", async (e) => {
  const [file] = e.target.files ?? [];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  loadedImage = img;
  drawToCanvas(img, inputCanvas, inputCtx);
  outputCanvas.width = inputCanvas.width;
  outputCanvas.height = inputCanvas.height;
  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  downloadBtn.disabled = true;
  updateStatus("图片已加载，可以开始转换。");
});

apiKeyInput.addEventListener("input", syncProviderFromKey);
providerSelect.addEventListener("change", () => {
  const provider = providerSelect.value;
  customBaseWrap.hidden = provider !== "custom";
  if (provider === "auto") {
    syncProviderFromKey();
    customBaseWrap.hidden = true;
  } else {
    refreshModels(provider);
    providerHint.textContent = `手动选择服务商：${providers[provider]?.label ?? "自定义"}`;
  }
});

runBtn.addEventListener("click", async () => {
  if (!loadedImage) {
    updateStatus("请先上传图片。");
    return;
  }

  const style = styleSelect.value;
  const strength = Number(strengthInput.value);
  const apiKey = apiKeyInput.value.trim();

  runBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    if (!apiKey) {
      updateStatus("正在使用本地无大模型模式转换…");
      localStylize(style, strength);
      outputBlobUrl = outputCanvas.toDataURL("image/png");
      downloadBtn.disabled = false;
      updateStatus("转换完成（本地模式）。");
      return;
    }

    const providerName = providerSelect.value === "auto" ? inferProviderByKey(apiKey) : providerSelect.value;
    updateStatus(`正在调用 ${providers[providerName]?.label ?? providerName}：${modelSelect.value}…`);

    const resultUrl = await runWithModel(providerName, apiKey, modelSelect.value, style, strength);
    await renderResultFromUrl(resultUrl);
    updateStatus("转换完成（模型模式）。");
  } catch (error) {
    console.error(error);
    updateStatus(`转换失败：${error.message}。已自动回退到本地模式。`);
    localStylize(style, strength);
    outputBlobUrl = outputCanvas.toDataURL("image/png");
    downloadBtn.disabled = false;
  } finally {
    runBtn.disabled = false;
  }
});

downloadBtn.addEventListener("click", () => {
  if (!outputBlobUrl) return;
  const a = document.createElement("a");
  a.href = outputBlobUrl;
  a.download = `styled-${styleSelect.value}.png`;
  a.click();
});

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

refreshModels("openai");
updateStatus("等待上传图片…");
