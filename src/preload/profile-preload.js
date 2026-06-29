const { contextBridge, ipcRenderer } = require('electron');

const fpArg = process.argv.find(arg => arg.startsWith('--fp='));
if (!fpArg) throw new Error('No fingerprint data');
const fp = JSON.parse(fpArg.slice(5));

function applyCanvasNoise(imageData, noise) {
  const data = imageData.data;
  for (const n of noise) {
    const idx = (n.y * imageData.width + n.x) * 4;
    if (idx + 3 < data.length) {
      data[idx] = Math.max(0, Math.min(255, data[idx] + n.r));
      data[idx+1] = Math.max(0, Math.min(255, data[idx+1] + n.g));
      data[idx+2] = Math.max(0, Math.min(255, data[idx+2] + n.b));
    }
  }
  return imageData;
}

// 1. webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });

// 2. Plugins
const pluginArr = fp.plugins.map(p => ({ name: p.name, filename: p.filename, description: p.description }));
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const plugins = Object.assign([], pluginArr);
    plugins.item = (idx) => plugins[idx] || null;
    plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
    plugins.refresh = () => {};
    return plugins;
  },
  configurable: true
});

// 3. Chrome object
if (!window.chrome) {
  window.chrome = {
    app: { isInstalled: false, InstallState: {}, RunningState: {} },
    runtime: { OnInstalledReason: {}, OnRestartRequiredReason: {}, PlatformArch: {}, PlatformNaclArch: {}, PlatformOs: {}, RequestUpdateCheckStatus: {} },
    csi: () => {},
    loadTimes: () => {}
  };
}

// 4. Language & hardware
Object.defineProperty(navigator, 'language', { get: () => fp.language, configurable: true });
Object.defineProperty(navigator, 'languages', { get: () => fp.languages, configurable: true });
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency, configurable: true });
Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory, configurable: true });
Object.defineProperty(navigator, 'platform', { get: () => fp.platform, configurable: true });

// 5. Screen
Object.defineProperty(window.screen, 'width', { get: () => fp.screenWidth, configurable: true });
Object.defineProperty(window.screen, 'height', { get: () => fp.screenHeight, configurable: true });
Object.defineProperty(window.screen, 'availWidth', { get: () => fp.screenWidth, configurable: true });
Object.defineProperty(window.screen, 'availHeight', { get: () => fp.screenHeight, configurable: true });
Object.defineProperty(window, 'outerWidth', { get: () => fp.screenWidth, configurable: true });
Object.defineProperty(window, 'outerHeight', { get: () => fp.screenHeight, configurable: true });

// 6. Timezone (fixed – no mutation of shared options)
const OrigDateTimeFormat = Intl.DateTimeFormat;
Intl.DateTimeFormat = function(locales, options) {
  const newOptions = options ? { ...options } : {};
  if (newOptions.timeZone === undefined) newOptions.timeZone = fp.timezone;
  return new OrigDateTimeFormat(locales, newOptions);
};
Intl.DateTimeFormat.prototype = OrigDateTimeFormat.prototype;

// 7. Canvas Spoofing (with proper toDataURL override)
const origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, ...args) {
  const ctx = origGetContext.call(this, type, ...args);
  if (type === '2d' && ctx) {
    const origGetImageData = ctx.getImageData;
    ctx.getImageData = function(x, y, w, h) {
      const imageData = origGetImageData.call(this, x, y, w, h);
      return applyCanvasNoise(imageData, fp.canvasNoise);
    };
  }
  return ctx;
};

const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
  try {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, this.width, this.height);
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.width;
      tempCanvas.height = this.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);
      return tempCanvas.toDataURL(type, quality);
    }
  } catch(e) {}
  return origToDataURL.call(this, type, quality);
};

// 8. WebGL Spoofing (both 1 and 2)
const contexts = [WebGLRenderingContext, WebGL2RenderingContext];
for (const ctxType of contexts) {
  if (ctxType) {
    const origGetParam = ctxType.prototype.getParameter;
    ctxType.prototype.getParameter = function(param) {
      if (param === 37445) return fp.webgl.vendor;
      if (param === 37446) return fp.webgl.renderer;
      return origGetParam.call(this, param);
    };
    const origGetExt = ctxType.prototype.getExtension;
    ctxType.prototype.getExtension = function(name) {
      if (name === 'WEBGL_debug_renderer_info') return {};
      return origGetExt.call(this, name);
    };
  }
}

// 9. AudioContext Spoofing (seed-dependent)
function seedHash(seed, key) {
  const h = require('crypto').createHash('sha256');
  h.update(seed + key);
  return parseInt(h.digest('hex').slice(0, 8), 16);
}
const origCreateOscillator = AudioContext.prototype.createOscillator;
AudioContext.prototype.createOscillator = function() {
  const osc = origCreateOscillator.call(this);
  const shift = (seedHash(fp.seed || 'default', 'audio') % 100) / 1000000;
  const origFreq = osc.frequency;
  osc.frequency = {
    get value() { return origFreq.value * (1 + shift); },
    set value(v) { origFreq.value = v / (1 + shift); },
    setValueAtTime: (v, t) => origFreq.setValueAtTime(v / (1 + shift), t)
  };
  return osc;
};

console.log('[SpotCheck] Stealth engine active for profile');
