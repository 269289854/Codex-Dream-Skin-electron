((cssText, artDataUrl, themeConfig) => {
  const VERSION = __DREAM_VERSION_JSON__;
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const CARD_GRID_ID = "codex-dream-skin-actions";
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const actions = [
    {
      icon: "</>",
      label: "探索并理解代码",
      prompt: "请探索并理解当前项目的代码结构，说明关键模块、入口和主要数据流。",
    },
    {
      icon: "+",
      label: "构建新功能、应用或工具",
      prompt: "请基于当前项目构建一个新功能、应用或工具。先分析现有模式，再完成实现和验证。",
    },
    {
      icon: "✓",
      label: "审查代码并提出修改建议",
      prompt: "请审查当前项目的代码，优先指出缺陷、回归风险和缺失测试，并提出具体修改建议。",
    },
    {
      icon: "✦",
      label: "修复问题和失败",
      prompt: "请诊断并修复当前项目中的问题或失败，先定位根因，再实施修复并运行相关验证。",
    },
  ];

  const builtinGlyphs = {
    sparkles: "✦", "wand-sparkles": "✧", image: "▣", send: "➤",
    "folder-code": "⌘", heart: "♥", pin: "●",
  };
  const renderSlot = (node, slot, fallback) => {
    if (!node) return;
    const source = themeConfig?.icons?.[slot];
    node.textContent = "";
    if (source?.dataUrl) {
      const image = document.createElement("img");
      image.src = source.dataUrl;
      image.alt = "";
      image.className = "dream-custom-icon";
      node.appendChild(image);
    } else {
      node.textContent = builtinGlyphs[source?.name] || fallback;
    }
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);

  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mediaType = artDataUrl.slice(5, artDataUrl.indexOf(";")) || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mediaType }));
  })();

  const isVisible = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden";
  };

  const findComposer = (home = document) => {
    const candidates = [...home.querySelectorAll('.ProseMirror[contenteditable="true"]')];
    return candidates.find(isVisible) || null;
  };

  const populateComposer = (prompt) => {
    const home = document.querySelector(".dream-home") || document;
    const composer = findComposer(home) || findComposer(document);
    if (!composer) return false;

    composer.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const text = `${composer.textContent?.trim() ? " " : ""}${prompt}`;
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch {}

    if (!inserted) {
      const beforeInput = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: text,
        inputType: "insertText",
      });
      if (composer.dispatchEvent(beforeInput)) {
        const fallbackRange = window.getSelection()?.getRangeAt(0);
        fallbackRange?.insertNode(document.createTextNode(text));
        fallbackRange?.collapse(false);
      }
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: text,
        inputType: "insertText",
      }));
    }

    composer.focus();
    return true;
  };

  const ensureActionGrid = (hero) => {
    let grid = document.getElementById(CARD_GRID_ID);
    if (grid && grid.parentElement !== hero) {
      grid.remove();
      grid = null;
    }
    if (grid?.dataset.dreamVersion === VERSION) return grid;
    grid?.remove();

    grid = document.createElement("div");
    grid.id = CARD_GRID_ID;
    grid.className = "dream-action-grid";
    grid.dataset.dreamVersion = VERSION;
    grid.setAttribute("aria-label", "初音未来主题快捷操作");
    actions.forEach((action, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dream-action-card";
      button.dataset.dreamPrompt = action.prompt;
      button.setAttribute("aria-label", action.label);
      button.innerHTML = `<span class="dream-action-icon" aria-hidden="true"></span><span class="dream-action-label"></span><span class="dream-action-heart" aria-hidden="true">♥</span>`;
      renderSlot(button.querySelector(".dream-action-icon"), index === 0 ? "cardPrimary" : "cardSecondary", action.icon);
      button.querySelector(".dream-action-label").textContent = action.label;
      renderSlot(button.querySelector(".dream-action-heart"), "decoration", "♥");
      button.addEventListener("click", () => populateComposer(action.prompt));
      grid.appendChild(button);
    });
    hero.appendChild(grid);
    return grid;
  };

  const findQuickModeBanner = (home) => {
    const labels = new Set(["立即启用", "启用快速模式", "Enable now", "Enable fast mode"]);
    const homeBox = home.getBoundingClientRect();
    const matches = [...home.querySelectorAll("button, h1, h2, h3, p, span, div")]
      .filter((node) => labels.has(node.textContent?.replace(/\s+/g, " ").trim()));
    for (const match of matches) {
      let candidate = match;
      for (let depth = 0; candidate && candidate !== home && depth < 7; depth += 1) {
        const box = candidate.getBoundingClientRect();
        if (box.width >= Math.min(520, homeBox.width * 0.55) && box.height >= 48 && box.height <= 150) {
          return candidate;
        }
        candidate = candidate.parentElement;
      }
    }
    return null;
  };

  const markCurrentNode = (selector, node, className) => {
    for (const candidate of document.querySelectorAll(selector)) {
      if (candidate !== node) candidate.classList.remove(className);
    }
    node?.classList.add(className);
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root) return;
    root.classList.add("codex-dream-skin");
    root.style.setProperty("--dream-art", `url("${artUrl}")`);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== VERSION) {
      style.textContent = cssText;
      style.dataset.dreamVersion = VERSION;
    }

    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    markCurrentNode("[role=main].dream-home", home, "dream-home");
    shellMain?.classList.toggle("dream-home-shell", Boolean(home));

    let hero = null;
    if (home) {
      hero = home.firstElementChild?.firstElementChild?.firstElementChild || null;
      markCurrentNode(".dream-hero", hero, "dream-hero");
      if (hero) ensureActionGrid(hero);
      const quickBanner = findQuickModeBanner(home);
      markCurrentNode(".dream-quick-mode-banner", quickBanner, "dream-quick-mode-banner");
    } else {
      markCurrentNode(".dream-hero", null, "dream-hero");
      markCurrentNode(".dream-quick-mode-banner", null, "dream-quick-mode-banner");
      document.getElementById(CARD_GRID_ID)?.remove();
    }

    const composerSurface = document.querySelector(".composer-surface-chrome");
    markCurrentNode(".composer-surface-chrome.dream-composer", composerSurface, "dream-composer");

    if (!shellMain || !document.body) return;
    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="dream-brand"><span class="dream-note">♫</span><span><b>初音未来主题 Codex App</b><small>你的专属 AI 编程与创作伙伴</small></span></div>
        <div class="dream-signature">MIKU ✦ 01</div>
        <div class="dream-sparkles"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="dream-wave">♫ · · · ♡ · · · ♪</div>
        <div class="dream-polaroid"></div>`;
      document.body.appendChild(chrome);
    }
    renderSlot(chrome.querySelector(".dream-note"), "branding", "♫");
    let pin = chrome.querySelector(".dream-polaroid-pin");
    if (!pin) {
      pin = document.createElement("span");
      pin.className = "dream-polaroid-pin";
      chrome.querySelector(".dream-polaroid")?.appendChild(pin);
    }
    renderSlot(pin, "polaroidPin", "●");

    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = `${Math.round(shellBox.left)}px`;
    chrome.style.top = `${Math.round(shellBox.top)}px`;
    chrome.style.width = `${Math.round(shellBox.width)}px`;
    chrome.style.height = `${Math.round(shellBox.height)}px`;
    chrome.classList.toggle("dream-home-shell", Boolean(home));

    if (home && composerSurface) {
      const composerBox = composerSurface.getBoundingClientRect();
      const photoTop = Math.max(110, Math.round(composerBox.top - shellBox.top - 58));
      chrome.style.setProperty("--dream-polaroid-top", `${photoTop}px`);
    }
  };

  const cleanup = () => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    document.documentElement?.classList.remove("codex-dream-skin");
    document.documentElement?.style.removeProperty("--dream-art");
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(".dream-hero").forEach((node) => node.classList.remove("dream-hero"));
    document.querySelectorAll(".dream-composer").forEach((node) => node.classList.remove("dream-composer"));
    document.querySelectorAll(".dream-quick-mode-banner").forEach((node) => node.classList.remove("dream-quick-mode-banner"));
    document.getElementById(CARD_GRID_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure,
    cleanup,
    populateComposer,
    observer,
    timer,
    scheduler,
    artUrl,
    version: VERSION,
  };
  ensure();
  return { installed: true, version: VERSION };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_CONFIG_JSON__)
