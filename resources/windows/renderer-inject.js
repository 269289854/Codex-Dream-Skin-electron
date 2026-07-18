((cssText, artDataUrl, themeConfig) => {
  const VERSION = __DREAM_VERSION_JSON__;
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const CARD_GRID_ID = "codex-dream-skin-actions";
  const PROJECT_PROXY_ID = "codex-dream-skin-project-proxy";
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const actions = Array.isArray(themeConfig?.actions) ? themeConfig.actions : [];
  let pendingPlacementUpdate = null;
  const takePlacementUpdate = () => {
    const update = pendingPlacementUpdate;
    pendingPlacementUpdate = null;
    return update;
  };
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  const builtinGlyphs = themeConfig?.builtinGlyphs || {};
  const renderSlot = (node, slot, fallback, useActionFallback = false) => {
    if (!node) return false;
    const source = themeConfig?.icons?.[slot];
    if (source?.dataUrl) {
      const currentImage = node.querySelector(":scope > .dream-custom-icon");
      if (currentImage?.getAttribute("src") === source.dataUrl && node.children.length === 1) return true;
      node.textContent = "";
      const image = document.createElement("img");
      image.src = source.dataUrl;
      image.alt = "";
      image.className = "dream-custom-icon";
      node.appendChild(image);
      return true;
    } else {
      const usesDefaultActionBuiltin = useActionFallback && themeConfig?.actionFallbackBuiltins?.[slot] === source?.name;
      const glyph = usesDefaultActionBuiltin ? fallback : (builtinGlyphs[source?.name] || fallback);
      if (node.textContent !== glyph || node.children.length > 0) node.textContent = glyph;
      return false;
    }
  };

  const clearSidebarModeIcon = (button) => {
    button?.classList.remove("dream-sidebar-mode-button");
    button?.querySelector(":scope > .dream-sidebar-mode-icon")?.remove();
  };

  const ensureSidebarModeIcon = () => {
    const selector = [
      'aside.app-shell-left-panel button[aria-label^="切换模式"]',
      'aside.app-shell-left-panel button[aria-label^="Switch mode"]'
    ].join(",");
    const button = findVisible(document, selector);
    document.querySelectorAll(".dream-sidebar-mode-button").forEach((current) => {
      if (current !== button) clearSidebarModeIcon(current);
    });
    if (!button) return;
    button.classList.add("dream-sidebar-mode-button");
    let icon = button.querySelector(":scope > .dream-sidebar-mode-icon");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "dream-sidebar-mode-icon";
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);
    }
    renderSlot(icon, "sidebarMode", "♫");
  };

  const ensureComposerBadge = (composer) => {
    if (!composer || themeConfig?.composerBadge?.visible === false) {
      document.querySelectorAll(".dream-composer-badge").forEach((node) => node.remove());
      return;
    }
    document.querySelectorAll(".dream-composer-badge").forEach((node) => {
      if (!composer.contains(node)) node.remove();
    });
    let badge = composer.querySelector(":scope > .dream-composer-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "dream-composer-badge";
      badge.setAttribute("aria-hidden", "true");
      composer.prepend(badge);
    }
    renderSlot(badge, "composerBadge", "♫");
  };

  const syncParticleViewport = (layer, shellBox) => {
    if (!(layer instanceof HTMLElement)) return;
    const top = Math.max(0, Number(themeConfig?.particleViewportTop) || 66);
    const width = Math.max(0, Number(shellBox?.width) || 0);
    const height = Math.max(0, (Number(shellBox?.height) || 0) - top);
    const values = {
      "--dream-particle-top": top,
      "--dream-particle-view-width": width,
      "--dream-particle-view-height": height,
      "--dream-particle-width": width + 96,
      "--dream-particle-height": height + 96,
      "--dream-particle-negative-width": -(width + 96),
      "--dream-particle-negative-height": -(height + 96),
      "--dream-particle-half-height": -(height / 2 + 48),
      "--dream-particle-meteor-height": height * .55 + 53,
      "--dream-particle-snow-first-height": height * .28 + 27,
      "--dream-particle-snow-second-height": height * .62 + 60,
    };
    for (const [name, value] of Object.entries(values)) layer.style.setProperty(name, `${value}px`);
  };

  const ensureSparkles = (chrome, shellBox) => {
    const config = themeConfig?.decorations?.sparkles;
    const particles = Array.isArray(themeConfig?.sparkleParticles) ? themeConfig.sparkleParticles : [];
    if (!chrome || config?.visible === false || particles.length === 0) {
      document.querySelectorAll(".dream-sparkles").forEach((node) => node.remove());
      return;
    }
    let layer = chrome.querySelector(":scope > .dream-sparkles");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "dream-sparkles";
      layer.setAttribute("aria-hidden", "true");
      chrome.prepend(layer);
    }
    const supportedEffects = new Set(["twinkle", "float", "rain", "meteor", "snow"]);
    const effect = supportedEffects.has(config?.effect) ? config.effect : "twinkle";
    const iconSlot = typeof themeConfig?.sparkleIconSlot === "string" ? themeConfig.sparkleIconSlot : "backgroundSparkle";
    layer.dataset.dreamEffect = effect;
    syncParticleViewport(layer, shellBox);
    const visibleParticles = particles.slice(0, Math.max(0, Math.min(24, Math.floor(config.count ?? particles.length))));
    while (layer.children.length > visibleParticles.length) layer.lastElementChild?.remove();
    const colors = Array.isArray(config.extraColors) ? config.extraColors : [];
    visibleParticles.forEach((particle, index) => {
      let node = layer.children[index];
      if (!(node instanceof HTMLElement)) {
        node = document.createElement("i");
        layer.appendChild(node);
      }
      node.classList.add("dream-particle");
      let content = node.querySelector(":scope > .dream-particle-content");
      if (!(content instanceof HTMLElement)) {
        node.textContent = "";
      }
      let trail = node.querySelector(":scope > .dream-particle-trail");
      if (!(trail instanceof HTMLElement)) {
        trail = document.createElement("span");
        trail.className = "dream-particle-trail";
        trail.setAttribute("aria-hidden", "true");
        node.prepend(trail);
      }
      if (!(content instanceof HTMLElement)) {
        content = document.createElement("span");
        content.className = "dream-particle-content";
        node.appendChild(content);
      }
      const colorIndex = colors.length > 0 ? particle.colorIndex % (colors.length + 1) : 0;
      node.style.setProperty("--dream-particle-x", `${particle.x}%`);
      node.style.setProperty("--dream-particle-y", `${particle.y}%`);
      const fallbackStartY = 2 + clamp(Number(particle.phase) || 0, 0, 1) * 30;
      node.style.setProperty("--dream-particle-start-y", `${clamp(Number(particle.startY) || fallbackStartY, 2, 32)}%`);
      node.style.setProperty("--dream-particle-duration", `${Math.max(0.1, Number(particle.duration) || 4)}s`);
      node.style.setProperty("--dream-particle-delay", `${Math.min(0, Number(particle.delay) || 0)}s`);
      node.style.setProperty("--dream-particle-drift", `${Number.isFinite(particle.drift) ? particle.drift : 0}px`);
      node.style.setProperty("--dream-particle-drift-reverse", `${Number.isFinite(particle.drift) ? -particle.drift : 0}px`);
      node.style.setProperty("--dream-particle-trail-height", `${Math.max(4, particle.size * 2.8)}px`);
      node.style.setProperty("--dream-particle-trail-width", `${Math.max(8, particle.size * 4.5)}px`);
      node.style.setProperty("--dream-sparkle-size", `${particle.size}px`);
      node.style.setProperty("--dream-sparkle-opacity", `${particle.opacity * (Number.isFinite(config.opacity) ? config.opacity : 1)}`);
      node.style.setProperty("--dream-sparkle-dim-opacity", `${particle.opacity * (Number.isFinite(config.opacity) ? config.opacity : 1) * .42}`);
      node.style.setProperty("--dream-sparkle-rotation", `${particle.rotation}deg`);
      node.style.setProperty("--dream-sparkle-color", colorIndex === 0 ? "var(--dream-sparkle)" : colors[colorIndex - 1]);
      node.style.setProperty("--dream-sparkle-glow", `${Number.isFinite(config.glow) ? config.glow : 0}px`);
      node.classList.toggle("dream-sparkle-image", renderSlot(content, iconSlot, "✦"));
      node.dataset.dreamIndex = `${index}`;
    });
  };

  const composerHasContent = (composer) => {
    const editor = composer?.querySelector(".ProseMirror");
    if (!editor) return false;
    if (editor.textContent?.trim()) return true;
    return Boolean(editor.querySelector("img, video, audio") || composer.querySelector("[data-attachment], [data-testid*='attachment' i], [class*='attachment' i], [data-testid*='file' i]"));
  };

  const ensureComposerMelody = (composer) => {
    const config = themeConfig?.decorations?.composerMelody;
    if (!composer || config?.visible === false) {
      document.querySelectorAll(".dream-composer-melody").forEach((node) => node.remove());
      return;
    }
    document.querySelectorAll(".dream-composer-melody").forEach((node) => {
      if (!composer.contains(node)) node.remove();
    });
    let melody = composer.querySelector(":scope > .dream-composer-melody");
    if (!melody) {
      melody = document.createElement("span");
      melody.className = "dream-composer-melody";
      melody.setAttribute("aria-hidden", "true");
      composer.appendChild(melody);
    }
    melody.textContent = typeof config.text === "string" ? config.text : "♫ · · · ♡ · · · ♪";
    melody.style.left = `${clamp(Number(config.position?.x) || 0.5, 0.1, 0.9) * 100}%`;
    melody.style.top = `${clamp(Number(config.position?.y) || 0.35, 0.1, 0.65) * 100}%`;
    melody.style.fontSize = `${clamp(Number(config.fontSize) || 16, 10, 32)}px`;
    melody.classList.toggle("dream-composer-melody-hidden", Boolean(config.hideWhenTyping && composerHasContent(composer)));
  };

  const replaceMarks = (selector, className, nodes) => {
    document.querySelectorAll(selector).forEach((node) => node.classList.remove(className));
    nodes.filter((node) => node instanceof HTMLElement).forEach((node) => node.classList.add(className));
  };

  const SIDEBAR_NAV_LABELS = [
    "新建任务", "New task", "拉取请求", "Pull requests", "站点", "Sites",
    "已安排", "Scheduled", "插件", "Plugins"
  ];
  const normalizedNodeLabel = (node) => `${node.textContent || ""} ${node.getAttribute?.("aria-label") || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
  const hasSidebarNavText = (node) => {
    const label = `${node.textContent || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
    return SIDEBAR_NAV_LABELS.some((candidate) => label.includes(candidate.toLowerCase()));
  };
  const isNewTaskNavAction = (node) => {
    const label = normalizedNodeLabel(node);
    return label.includes("新建任务") || label.includes("new task");
  };
  const findSidebarNavRow = (nav, action) => {
    let parent = action.parentElement;
    while (parent && parent !== nav) {
      const actions = [...parent.querySelectorAll("a, button")];
      const hasSiblingNavAction = actions.some((candidate) => candidate !== action && hasSidebarNavText(candidate));
      if (actions.length > 1 && !hasSiblingNavAction && actions.length <= 6) return parent;
      parent = parent.parentElement;
    }
    return action;
  };
  const isSidebarNavSelected = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.matches('[aria-current="page"], [aria-selected="true"], [data-active="true"], [data-state="active"]')) return true;
    return [...node.classList].some((token) => token === "bg-token-list-hover-background" || /(?:selected|active|current)/i.test(token));
  };
  const ensureSidebarNavigation = () => {
    const cleanup = () => {
      for (const className of ["dream-sidebar-new-task-row", "dream-sidebar-new-task-row-selected"]) {
        document.querySelectorAll(`.${className}`).forEach((node) => node.classList.remove(className));
      }
    };
    const sidebar = findVisible(document, "aside.app-shell-left-panel");
    const nav = sidebar && [...sidebar.querySelectorAll("nav")].find(isVisible);
    if (!nav) {
      cleanup();
      return;
    }
    cleanup();
    const action = [...nav.querySelectorAll("a, button")].find(isNewTaskNavAction);
    if (!(action instanceof HTMLElement)) return;
    const row = findSidebarNavRow(nav, action);
    row.classList.add("dream-sidebar-new-task-row");
    const selected = isSidebarNavSelected(row) || [...row.querySelectorAll("*")].some(isSidebarNavSelected);
    row.classList.toggle("dream-sidebar-new-task-row-selected", selected);
  };

  const ensureSidebarSurfaces = () => {
    const sidebar = findVisible(document, "aside.app-shell-left-panel");
    if (!sidebar) {
      for (const className of ["dream-sidebar-header", "dream-sidebar-search-button", "dream-sidebar-project-row", "dream-sidebar-task-row", "dream-sidebar-task-row-selected", "dream-sidebar-footer", "dream-sidebar-avatar"]) {
        document.querySelectorAll(`.${className}`).forEach((node) => node.classList.remove(className));
      }
      ensureSidebarNavigation();
      return;
    }
    ensureSidebarNavigation();
    replaceMarks(".dream-sidebar-header", "dream-sidebar-header", [...sidebar.querySelectorAll(":scope > header, :scope > div > header")]);
    replaceMarks(".dream-sidebar-search-button", "dream-sidebar-search-button", [...sidebar.querySelectorAll('button[aria-label*="搜索"], button[aria-label*="Search" i]')]);
    replaceMarks(".dream-sidebar-project-row", "dream-sidebar-project-row", [...sidebar.querySelectorAll('[data-project-id], [data-testid*="project" i], button[aria-label*="项目"], button[aria-label*="project" i]')]);
    replaceMarks(".dream-sidebar-task-row", "dream-sidebar-task-row", [...sidebar.querySelectorAll('[data-app-action-sidebar-thread-row], [data-task-id], [data-testid*="task" i], button[aria-label*="任务"], button[aria-label*="task" i]')]);
    document.querySelectorAll(".dream-sidebar-task-row-selected").forEach((node) => node.classList.remove("dream-sidebar-task-row-selected"));
    document.querySelectorAll(".dream-sidebar-task-row").forEach((node) => {
      const selected = isSidebarNavSelected(node) || [...node.querySelectorAll("*")].some(isSidebarNavSelected);
      node.classList.toggle("dream-sidebar-task-row-selected", selected);
    });
    replaceMarks(".dream-sidebar-footer", "dream-sidebar-footer", [...sidebar.querySelectorAll(":scope > footer, :scope > div > footer")]);
    replaceMarks(".dream-sidebar-avatar", "dream-sidebar-avatar", [...sidebar.querySelectorAll('[data-testid*="avatar" i], [class*="avatar" i]')]);
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

  const findVisible = (root, selector) =>
    [...root.querySelectorAll(selector)].find(isVisible) || null;

  const installPolaroidDragging = (chrome, polaroid) => {
    if (!(chrome instanceof HTMLElement) || !(polaroid instanceof HTMLElement)) return;
    const themeId = typeof themeConfig?.themeId === "string" ? themeConfig.themeId : "";
    const dragVersion = `${VERSION}:${themeId}`;
    if (polaroid.dataset.dreamDragVersion === dragVersion) return;

    polaroid.dataset.dreamDragVersion = dragVersion;
    polaroid.classList.remove("dream-polaroid-dragging");
    polaroid.style.removeProperty("left");
    polaroid.style.removeProperty("right");
    polaroid.style.removeProperty("top");
    let drag = null;

    const finishDrag = (event) => {
      if (!drag) return;
      const completed = drag;
      drag = null;
      polaroid.classList.remove("dream-polaroid-dragging");
      if (polaroid.hasPointerCapture?.(completed.pointerId)) polaroid.releasePointerCapture(completed.pointerId);
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (completed.moved && themeId) {
        pendingPlacementUpdate = { themeId, x: completed.x, y: completed.y };
      }
    };

    polaroid.onpointerdown = (event) => {
      if (event.button !== 0 || !themeId) return;
      const shellBox = chrome.getBoundingClientRect();
      const photoBox = polaroid.getBoundingClientRect();
      const shellWidth = shellBox.width;
      const shellHeight = shellBox.height;
      const photoWidth = polaroid.offsetWidth || photoBox.width;
      const photoHeight = polaroid.offsetHeight || photoBox.height;
      if (shellWidth <= 0 || shellHeight <= 0 || photoWidth <= 0 || photoHeight <= 0) return;
      const startLeft = polaroid.offsetLeft;
      const startTop = polaroid.offsetTop;
      drag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startLeft,
        startTop,
        shellWidth,
        shellHeight,
        maxLeft: Math.max(0, shellWidth - photoWidth),
        maxTop: Math.max(0, shellHeight - photoHeight),
        x: clamp(startLeft / shellWidth, 0, 1),
        y: clamp(startTop / shellHeight, 0, 1),
        moved: false,
      };
      polaroid.classList.add("dream-polaroid-dragging");
      polaroid.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };

    polaroid.onpointermove = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const left = clamp(drag.startLeft + event.clientX - drag.startClientX, 0, drag.maxLeft);
      const top = clamp(drag.startTop + event.clientY - drag.startClientY, 0, drag.maxTop);
      drag.x = left / drag.shellWidth;
      drag.y = top / drag.shellHeight;
      drag.moved = drag.moved || left !== drag.startLeft || top !== drag.startTop;
      polaroid.style.setProperty("right", "auto", "important");
      polaroid.style.setProperty("left", `${drag.x * 100}%`, "important");
      polaroid.style.setProperty("top", `${drag.y * 100}%`, "important");
      event.preventDefault();
      event.stopPropagation();
    };

    polaroid.onpointerup = finishDrag;
    polaroid.onpointercancel = finishDrag;
    polaroid.onlostpointercapture = finishDrag;
  };

  const findHomeContext = () => {
    const headings = [...document.querySelectorAll('[data-feature="game-source"]')].filter(isVisible);
    for (const heading of headings) {
      const home = heading.closest('[role="main"]');
      if (!home || !isVisible(home)) continue;
      const composerSurface = findVisible(home, ".composer-surface-chrome");
      const composer = findComposer(home);
      if (!composerSurface || !composer || !composerSurface.contains(composer)) continue;
      const projectButton = findVisible(home, '[data-composer-navigation-target="workspace-project"]');
      return { home, heading, composerSurface, projectButton };
    }
    return null;
  };

  const findHero = ({ home, heading, composerSurface }) => {
    let candidate = heading;
    let parent = heading.parentElement;
    while (parent && parent !== home) {
      if (parent.contains(composerSurface)) break;
      candidate = parent;
      parent = parent.parentElement;
    }
    return candidate !== heading && candidate instanceof HTMLElement && isVisible(candidate) ? candidate : null;
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
    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dream-action-card";
      button.dataset.dreamPrompt = action.prompt;
      button.setAttribute("aria-label", action.label);
      button.innerHTML = `<span class="dream-action-icon" aria-hidden="true"></span><span class="dream-action-label"></span><span class="dream-action-heart" aria-hidden="true">♥</span>`;
      renderSlot(button.querySelector(".dream-action-icon"), action.iconSlot, action.icon, true);
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

  const clearHeading = (heading) => {
    heading?.querySelectorAll(":scope > .dream-copy-node").forEach((node) => node.remove());
    heading?.querySelectorAll('[data-dream-project-proxy="true"]').forEach((node) => node.remove());
    heading?.classList.remove("dream-heading");
    heading?.removeAttribute("data-dream-copy-version");
    heading?.querySelectorAll(".dream-project-selector").forEach((node) => node.classList.remove("dream-project-selector"));
    heading?.parentElement?.classList.remove("dream-heading-region");
  };

  const projectLabel = (button) => button?.textContent?.replace(/\s+/g, " ").trim() || "";

  const ensureProjectProxy = (heading, sourceButton) => {
    const label = projectLabel(sourceButton);
    if (!label) return null;
    let proxy = document.getElementById(PROJECT_PROXY_ID);
    if (proxy && proxy.parentElement !== heading) {
      proxy.remove();
      proxy = null;
    }
    if (!proxy) {
      proxy = document.createElement("button");
      proxy.id = PROJECT_PROXY_ID;
      proxy.type = "button";
      proxy.dataset.dreamProjectProxy = "true";
      proxy.className = "dream-copy-node dream-project-selector dream-project-proxy";
      proxy.addEventListener("click", () => {
        findVisible(document, '[data-composer-navigation-target="workspace-project"]')?.click();
      });
    }
    if (proxy.textContent !== label) proxy.textContent = label;
    return proxy;
  };

  const ensureHeading = (context) => {
    const { heading, projectButton: composerProjectButton } = context;
    const nativeProjectButton = heading.querySelector('button:not([data-dream-project-proxy="true"])');
    const parts = themeConfig?.copy?.parts;
    if (!heading || (!nativeProjectButton && !composerProjectButton) ||
        typeof parts?.before !== "string" || typeof parts?.after !== "string") {
      document.querySelectorAll(".dream-heading").forEach(clearHeading);
      return null;
    }

    for (const previousHeading of document.querySelectorAll(".dream-heading")) {
      if (previousHeading !== heading) clearHeading(previousHeading);
    }
    heading.classList.add("dream-heading");
    heading.parentElement?.classList.add("dream-heading-region");
    nativeProjectButton?.classList.add("dream-project-selector");

    const proxy = nativeProjectButton ? null : ensureProjectProxy(heading, composerProjectButton);
    if (!nativeProjectButton && !proxy) {
      clearHeading(heading);
      return null;
    }
    if (nativeProjectButton) document.getElementById(PROJECT_PROXY_ID)?.remove();

    if (heading.dataset.dreamCopyVersion !== VERSION) {
      heading.querySelectorAll(":scope > .dream-copy-node").forEach((node) => node.remove());
      const before = document.createElement("span");
      before.className = "dream-copy-node dream-copy-before";
      before.textContent = parts.before;
      heading.insertBefore(before, heading.firstChild);

      const after = document.createElement("span");
      after.className = "dream-copy-node dream-copy-after";
      after.textContent = parts.after;
      heading.appendChild(after);

      const subtitle = document.createElement("span");
      subtitle.className = "dream-copy-node dream-copy-subtitle";
      subtitle.textContent = typeof themeConfig.copy.subtitle === "string" ? themeConfig.copy.subtitle : "";
      heading.appendChild(subtitle);
      heading.dataset.dreamCopyVersion = VERSION;
    }
    const before = heading.querySelector(":scope > .dream-copy-before");
    if (proxy && proxy.previousElementSibling !== before) before?.after(proxy);
    return heading;
  };

  const clearHomeLayout = () => {
    document.querySelectorAll(".dream-heading").forEach(clearHeading);
    markCurrentNode("[role=main].dream-home", null, "dream-home");
    markCurrentNode(".dream-hero", null, "dream-hero");
    markCurrentNode(".dream-layout-root", null, "dream-layout-root");
    markCurrentNode(".dream-project-bar", null, "dream-project-bar");
    markCurrentNode(".dream-quick-mode-banner", null, "dream-quick-mode-banner");
    markCurrentNode(".dream-native-suggestions", null, "dream-native-suggestions");
    document.getElementById(PROJECT_PROXY_ID)?.remove();
    document.getElementById(CARD_GRID_ID)?.remove();
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

    ensureSidebarModeIcon();
    ensureSidebarSurfaces();

    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const context = findHomeContext();
    const heading = context ? ensureHeading(context) : null;
    const hero = context && heading ? findHero(context) : null;
    const home = hero ? context.home : null;
    markCurrentNode("[role=main].dream-home", home, "dream-home");
    shellMain?.classList.toggle("dream-home-shell", Boolean(home));

    if (home && context && hero) {
      markCurrentNode(".dream-hero", hero, "dream-hero");
      markCurrentNode(".dream-layout-root", hero, "dream-layout-root");
      ensureActionGrid(hero);
      const quickBanner = findQuickModeBanner(home);
      markCurrentNode(".dream-quick-mode-banner", quickBanner, "dream-quick-mode-banner");

      const projectBar = context.projectButton?.closest(".horizontal-scroll-fade-mask")?.parentElement ||
        context.projectButton?.parentElement || null;
      markCurrentNode(".dream-project-bar", projectBar, "dream-project-bar");
      const nativeSuggestions = home.querySelector('[data-home-ambient-suggestions="true"], [data-home-ambient-suggestions]');
      markCurrentNode(".dream-native-suggestions", nativeSuggestions, "dream-native-suggestions");
    } else {
      clearHomeLayout();
    }

    const composerSurface = context?.composerSurface || findVisible(document, ".composer-surface-chrome");
    markCurrentNode(".composer-surface-chrome.dream-composer", composerSurface, "dream-composer");
    ensureComposerBadge(composerSurface);
    ensureComposerMelody(composerSurface);

    if (!shellMain || !document.body) return;
    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="dream-brand"><span class="dream-note">♫</span><span><b></b><small></small></span></div>
        <div class="dream-signature"></div>
        <div class="dream-sparkles" aria-hidden="true"></div>
        <div class="dream-polaroid"></div>`;
      document.body.appendChild(chrome);
    }
    renderSlot(chrome.querySelector(".dream-note"), "branding", "♫");
    const copy = themeConfig?.copy || {};
    const brandTitle = chrome.querySelector(".dream-brand b");
    const brandSubtitle = chrome.querySelector(".dream-brand small");
    const brandSignature = chrome.querySelector(".dream-signature");
    if (brandTitle) brandTitle.textContent = typeof copy.brandTitle === "string" ? copy.brandTitle : "初音未来主题 Codex App";
    if (brandSubtitle) brandSubtitle.textContent = typeof copy.brandSubtitle === "string" ? copy.brandSubtitle : "你的专属 AI 编程与创作伙伴";
    if (brandSignature) brandSignature.textContent = typeof copy.brandSignature === "string" ? copy.brandSignature : "MIKU ✦ 01";
    chrome.querySelectorAll(".dream-wave").forEach((node) => node.remove());
    let pin = chrome.querySelector(".dream-polaroid-pin");
    if (!pin) {
      pin = document.createElement("span");
      pin.className = "dream-polaroid-pin";
      chrome.querySelector(".dream-polaroid")?.appendChild(pin);
    }
    renderSlot(pin, "polaroidPin", "●");
    installPolaroidDragging(chrome, chrome.querySelector(".dream-polaroid"));

    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = `${Math.round(shellBox.left)}px`;
    chrome.style.top = `${Math.round(shellBox.top)}px`;
    chrome.style.width = `${Math.round(shellBox.width)}px`;
    chrome.style.height = `${Math.round(shellBox.height)}px`;
    chrome.classList.toggle("dream-home-shell", Boolean(home));
    ensureSparkles(chrome, shellBox);

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
    document.querySelectorAll(".dream-layout-root").forEach((node) => node.classList.remove("dream-layout-root"));
    document.querySelectorAll(".dream-heading").forEach(clearHeading);
    document.querySelectorAll(".dream-heading-region").forEach((node) => node.classList.remove("dream-heading-region"));
    document.querySelectorAll(".dream-project-selector").forEach((node) => node.classList.remove("dream-project-selector"));
    document.querySelectorAll(".dream-project-bar").forEach((node) => node.classList.remove("dream-project-bar"));
    document.querySelectorAll(".dream-composer").forEach((node) => node.classList.remove("dream-composer"));
    document.querySelectorAll(".dream-composer-badge").forEach((node) => node.remove());
    document.querySelectorAll(".dream-composer-melody").forEach((node) => node.remove());
    document.querySelectorAll(".dream-sparkles").forEach((node) => node.remove());
    document.querySelectorAll(".dream-wave").forEach((node) => node.remove());
    document.querySelectorAll(".dream-quick-mode-banner").forEach((node) => node.classList.remove("dream-quick-mode-banner"));
    document.querySelectorAll(".dream-native-suggestions").forEach((node) => node.classList.remove("dream-native-suggestions"));
    document.querySelectorAll(".dream-sidebar-mode-button").forEach(clearSidebarModeIcon);
    for (const className of ["dream-sidebar-header", "dream-sidebar-search-button", "dream-sidebar-project-row", "dream-sidebar-task-row", "dream-sidebar-task-row-selected", "dream-sidebar-footer", "dream-sidebar-avatar", "dream-sidebar-new-task-row", "dream-sidebar-new-task-row-selected"]) {
      document.querySelectorAll(`.${className}`).forEach((node) => node.classList.remove(className));
    }
    document.getElementById(PROJECT_PROXY_ID)?.remove();
    document.getElementById(CARD_GRID_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
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
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  const resizeHandler = scheduleEnsure;
  window.addEventListener("resize", resizeHandler);
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure,
    cleanup,
    populateComposer,
    takePlacementUpdate,
    observer,
    resizeHandler,
    timer,
    scheduler,
    artUrl,
    version: VERSION,
  };
  ensure();
  return { installed: true, version: VERSION };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_CONFIG_JSON__)
