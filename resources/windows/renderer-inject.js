((cssText, artDataUrl, themeConfig) => {
  const VERSION = __DREAM_VERSION_JSON__;
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const CARD_GRID_ID = "codex-dream-skin-actions";
  const PROJECT_PROXY_ID = "codex-dream-skin-project-proxy";
  const HEADING_DECORATION_ID = "codex-dream-skin-heading-decoration";
  const projectAnchorRestorers = new WeakMap();
  const sidebarNavRestorers = new WeakMap();
  const sidebarCopyRestorers = new Map();

  const actions = Array.isArray(themeConfig?.actions) ? themeConfig.actions : [];
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const setInlineStyle = (node, property, value) => {
    if (!(node instanceof HTMLElement) || node.style.getPropertyValue(property) === value) return;
    node.style.setProperty(property, value);
  };

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
    if (editor.querySelector("img, video, audio") || composer.querySelector("[data-attachment]")) return true;
    const attachmentCandidates = [...composer.querySelectorAll("[data-testid*='attachment' i], [class*='attachment' i], [data-testid*='file' i]")];
    return attachmentCandidates.some((node) => Boolean(
      node.textContent?.trim() ||
      node.querySelector("img, video, audio") ||
      (node.matches("[class*='attachments' i]") && node.children.length > 0)
    ));
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
      melody.setAttribute("aria-hidden", "true");
      composer.appendChild(melody);
    }
    const mode = config?.mode === "gif" ? "gif" : "text";
    const supportedEffects = new Set(["none", "wave", "barrage", "scroll", "float", "pulse"]);
    const effect = mode === "text" && supportedEffects.has(config?.effect) ? config.effect : "none";
    const direction = config?.direction === "right" ? "right" : "left";
    const speed = clamp(Number(config?.speed) || 1, 0.5, 2);
    const baseDuration = { none: 0, wave: 1.4, barrage: 7, scroll: 6, float: 2.6, pulse: 2 }[effect];
    const trackEffect = effect === "barrage" || effect === "scroll";
    const text = typeof config.text === "string" ? config.text : "♫ · · · ♡ · · · ♪";
    const gifWidth = clamp(Number(config.gifWidth) || 96, 32, 240);
    const dataUrl = mode === "gif" && typeof config.dataUrl === "string" && /^data:image\/gif;base64,/i.test(config.dataUrl) ? config.dataUrl : null;
    if (mode === "gif" && !dataUrl) {
      melody.remove();
      return;
    }
    const renderKey = JSON.stringify({ mode, effect, direction, speed, text: mode === "text" ? text : null, gifWidth: mode === "gif" ? gifWidth : null });
    const contentMatches = (() => {
      if (melody.dataset.dreamComposerRenderKey !== renderKey) return false;
      if (mode === "gif") {
        const image = melody.querySelector(":scope > .dream-composer-decoration-gif");
        return melody.children.length === 1 && image instanceof HTMLImageElement && image.getAttribute("src") === dataUrl;
      }
      if (effect === "wave") {
        const wave = melody.querySelector(":scope > .dream-composer-decoration-wave");
        const characters = wave ? [...wave.children] : [];
        const renderedText = [...text].map((character) => character === " " ? "\u00a0" : character).join("");
        return melody.children.length === 1 && wave instanceof HTMLElement && characters.length === [...text].length &&
          characters.every((node) => node.classList.contains("dream-composer-decoration-character")) && wave.textContent === renderedText;
      }
      if (effect === "barrage") {
        const lanes = [...melody.querySelectorAll(":scope > .dream-composer-decoration-barrage")];
        return melody.children.length === 3 && lanes.length === 3 && lanes.every((node) =>
          node.classList.contains(`dream-composer-decoration-direction-${direction}`) && node.textContent === text
        );
      }
      const node = melody.querySelector(`:scope > .dream-composer-decoration-${effect}`);
      return melody.children.length === 1 && node instanceof HTMLElement && node.textContent === text &&
        (effect !== "scroll" || node.classList.contains(`dream-composer-decoration-direction-${direction}`));
    })();
    melody.className = `dream-composer-melody dream-composer-decoration${trackEffect ? " dream-composer-decoration-track" : ""}`;
    melody.dataset.dreamComposerMode = mode;
    melody.dataset.dreamComposerEffect = effect;
    if (trackEffect) melody.dataset.dreamComposerDirection = direction;
    else delete melody.dataset.dreamComposerDirection;
    melody.style.left = trackEffect ? "48px" : `${clamp(Number(config.position?.x) || 0.5, 0.1, 0.9) * 100}%`;
    melody.style.right = trackEffect ? "48px" : "auto";
    melody.style.top = `${clamp(Number(config.position?.y) || 0.35, 0.1, 0.65) * 100}%`;
    melody.style.fontSize = `${clamp(Number(config.fontSize) || 16, 10, 32)}px`;
    melody.style.setProperty("--dream-composer-effect-duration", `${baseDuration / speed}s`);

    if (!contentMatches) {
      melody.replaceChildren();
      if (mode === "gif") {
        const image = document.createElement("img");
        image.className = "dream-composer-decoration-gif";
        image.alt = "";
        image.draggable = false;
        image.src = dataUrl;
        image.style.width = `${gifWidth}px`;
        melody.appendChild(image);
      } else {
        if (effect === "wave") {
          const wave = document.createElement("span");
          wave.className = "dream-composer-decoration-text dream-composer-decoration-wave";
          [...text].forEach((character, index) => {
            const node = document.createElement("span");
            node.className = "dream-composer-decoration-character";
            node.textContent = character === " " ? "\u00a0" : character;
            node.style.animationDelay = `${-index * 0.06 / speed}s`;
            wave.appendChild(node);
          });
          melody.appendChild(wave);
        } else if (effect === "barrage") {
          [0, 1, 2].forEach((lane) => {
            const node = document.createElement("span");
            node.className = `dream-composer-decoration-text dream-composer-decoration-barrage dream-composer-decoration-direction-${direction}`;
            node.textContent = text;
            node.style.top = `${(lane + 0.5) / 3 * 100}%`;
            node.style.animationDelay = `${-7 / speed * lane / 3}s`;
            melody.appendChild(node);
          });
        } else {
          const node = document.createElement("span");
          node.className = `dream-composer-decoration-text dream-composer-decoration-${effect}${effect === "scroll" ? ` dream-composer-decoration-direction-${direction}` : ""}`;
          node.textContent = text;
          melody.appendChild(node);
        }
      }
      melody.dataset.dreamComposerRenderKey = renderKey;
    }
    melody.classList.toggle("dream-composer-melody-hidden", Boolean(config.hideWhenTyping && composerHasContent(composer)));
  };

  const replaceMarks = (selector, className, nodes) => {
    document.querySelectorAll(selector).forEach((node) => node.classList.remove(className));
    nodes.filter((node) => node instanceof HTMLElement).forEach((node) => node.classList.add(className));
  };

  const SIDEBAR_NAV_FALLBACKS = [
    { id: "newTask", copyField: "sidebarNavNewTask", iconSlot: "sidebarNavNewTask", previewTarget: "sidebar-nav-new-task", aliases: ["新建任务", "New task"] },
    { id: "pullRequests", copyField: "sidebarNavPullRequests", iconSlot: "sidebarNavPullRequests", previewTarget: "sidebar-nav-pull-requests", aliases: ["拉取请求", "Pull requests"] },
    { id: "sites", copyField: "sidebarNavSites", iconSlot: "sidebarNavSites", previewTarget: "sidebar-nav-sites", aliases: ["站点", "Sites"] },
    { id: "scheduled", copyField: "sidebarNavScheduled", iconSlot: "sidebarNavScheduled", previewTarget: "sidebar-nav-scheduled", aliases: ["已安排", "Scheduled"] },
    { id: "plugins", copyField: "sidebarNavPlugins", iconSlot: "sidebarNavPlugins", previewTarget: "sidebar-nav-plugins", aliases: ["插件", "Plugins"] }
  ];
  const sidebarNavigation = Array.isArray(themeConfig?.sidebarNavigation) && themeConfig.sidebarNavigation.length > 0 ? themeConfig.sidebarNavigation : SIDEBAR_NAV_FALLBACKS;
  const normalizedNodeLabel = (node) => `${node.textContent || ""} ${node.getAttribute?.("aria-label") || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
  const hasSidebarNavText = (node) => {
    const label = `${node.textContent || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
    return sidebarNavigation.some((item) => (item.aliases || []).some((candidate) => label.includes(String(candidate).toLowerCase())));
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
  const findSidebarNavLabelNode = (button, item) => {
    const aliases = (item.aliases || []).map((candidate) => String(candidate).toLowerCase());
    const candidates = [...button.querySelectorAll("span")].filter((node) => node.children.length === 0 && node.textContent?.trim());
    return candidates.find((node) => aliases.some((alias) => node.textContent.trim().toLowerCase() === alias)) || candidates.at(-1) || button;
  };
  const findSidebarNavIconNode = (button) => [...button.querySelectorAll("span")].find((node) => node.querySelector(":scope > svg")) || button.querySelector("svg")?.parentElement || null;
  const restoreSidebarNav = (button) => {
    const record = sidebarNavRestorers.get(button);
    if (!record) return;
    if (record.labelNode?.isConnected) record.labelNode.textContent = record.text;
    if (record.iconNode?.isConnected) {
      record.iconNode.innerHTML = record.iconHtml;
      if (record.iconClass === null) record.iconNode.removeAttribute("class");
      else record.iconNode.setAttribute("class", record.iconClass);
    }
    for (const className of record.classes) (record.row || button).classList.remove(className);
    sidebarNavRestorers.delete(button);
  };
  const ensureSidebarNavigation = () => {
    const sidebar = findVisible(document, "aside.app-shell-left-panel");
    const nav = sidebar && [...sidebar.querySelectorAll("nav")].find(isVisible);
    if (!nav) {
      return;
    }
    const actions = [...nav.querySelectorAll("a, button")].filter((node) => node instanceof HTMLElement);
    const activeActions = new Set();
    for (const item of sidebarNavigation) {
      const action = actions.find((candidate) => candidate.dataset.dreamSidebarNav === item.id || (item.aliases || []).some((alias) => normalizedNodeLabel(candidate).includes(String(alias).toLowerCase())));
      if (!(action instanceof HTMLElement)) continue;
      activeActions.add(action);
      const row = findSidebarNavRow(nav, action);
      const existing = sidebarNavRestorers.get(action);
      const labelNode = existing?.labelNode || findSidebarNavLabelNode(action, item);
      const iconNode = existing?.iconNode || findSidebarNavIconNode(action);
      if (!existing) sidebarNavRestorers.set(action, {
        labelNode,
        text: labelNode.textContent || "",
        iconNode,
        iconHtml: iconNode?.innerHTML || "",
        iconClass: iconNode?.getAttribute("class") ?? null,
        row,
        classes: [`dream-sidebar-nav-${item.id}`, `dream-sidebar-nav-${item.id}-selected`, ...(item.id === "newTask" ? ["dream-sidebar-new-task-row", "dream-sidebar-new-task-row-selected"] : [])]
      });
      action.dataset.dreamSidebarNav = item.id;
      const copy = themeConfig?.copy?.[item.copyField];
      if (typeof copy === "string" && copy.trim()) labelNode.textContent = copy;
      if (iconNode) {
        iconNode.classList.add("dream-sidebar-nav-icon");
        renderSlot(iconNode, item.iconSlot, "✦");
      }
      const classes = [`dream-sidebar-nav-${item.id}`, `dream-sidebar-nav-${item.id}-selected`];
      row.classList.add(classes[0]);
      if (item.id === "newTask") row.classList.add("dream-sidebar-new-task-row");
      const selected = isSidebarNavSelected(row) || [...row.querySelectorAll("*")].some(isSidebarNavSelected);
      row.classList.toggle(classes[1], selected);
      if (item.id === "newTask") row.classList.toggle("dream-sidebar-new-task-row-selected", selected);
    }
    document.querySelectorAll("[data-dream-sidebar-nav]").forEach((node) => {
      if (!(node instanceof HTMLElement) || activeActions.has(node)) return;
      restoreSidebarNav(node);
      node.removeAttribute("data-dream-sidebar-nav");
    });
  };

  const ensureSidebarFixedCopy = () => {
    const sidebar = findVisible(document, "aside.app-shell-left-panel");
    if (!sidebar) return;
    const entries = [
      { field: "sidebarModeTitle", aliases: ["Codex"], selector: 'button[aria-label^="切换模式"], button[aria-label^="Switch mode"]' },
      { field: "sidebarProjectsTitle", aliases: ["项目", "Projects"], selector: 'button[data-app-action-sidebar-section-toggle]' },
      { field: "sidebarTasksTitle", aliases: ["任务", "Tasks"], selector: 'button[data-app-action-sidebar-section-toggle]' }
    ];
    for (const entry of entries) {
      const candidate = [...sidebar.querySelectorAll(entry.selector)].find((node) => {
        const text = normalizedNodeLabel(node);
        return entry.aliases.some((alias) => text.includes(alias.toLowerCase()));
      });
      if (!(candidate instanceof HTMLElement)) continue;
      const labelNode = [...candidate.querySelectorAll("span")].find((node) => node.children.length === 0 && entry.aliases.some((alias) => node.textContent?.trim().toLowerCase() === alias.toLowerCase()));
      if (!(labelNode instanceof HTMLElement)) continue;
      if (!sidebarCopyRestorers.has(labelNode)) sidebarCopyRestorers.set(labelNode, { text: labelNode.textContent || "", button: candidate, ariaLabel: candidate.getAttribute("aria-label") });
      const copy = themeConfig?.copy?.[entry.field];
      if (typeof copy === "string" && copy.trim()) labelNode.textContent = copy;
      if (entry.field === "sidebarModeTitle" && typeof copy === "string" && copy.trim() && candidate.hasAttribute("aria-label")) {
        const ariaLabel = candidate.getAttribute("aria-label") || "";
        candidate.setAttribute("aria-label", ariaLabel.replace(/Codex|当前模式：[^，]+|current mode:\s*[^,]+/i, (match) => match.includes("当前模式") ? `当前模式：${copy}` : match.toLowerCase().includes("current") ? `current mode: ${copy}` : String(copy)));
      }
    }
  };

  const ensureSidebarSurfaces = () => {
    const sidebar = findVisible(document, "aside.app-shell-left-panel");
    if (!sidebar) {
      for (const className of ["dream-sidebar-header", "dream-sidebar-search-button", "dream-sidebar-project-row", "dream-sidebar-project-row-selected", "dream-sidebar-task-row", "dream-sidebar-task-row-selected", "dream-sidebar-footer", "dream-sidebar-avatar"]) {
        document.querySelectorAll(`.${className}`).forEach((node) => node.classList.remove(className));
      }
      ensureSidebarNavigation();
      return;
    }
    ensureSidebarNavigation();
    ensureSidebarFixedCopy();
    replaceMarks(".dream-sidebar-header", "dream-sidebar-header", [...sidebar.querySelectorAll(":scope > header, :scope > div > header")]);
    replaceMarks(".dream-sidebar-search-button", "dream-sidebar-search-button", [...sidebar.querySelectorAll('button[aria-label*="搜索"], button[aria-label*="Search" i]')]);
    replaceMarks(".dream-sidebar-project-row", "dream-sidebar-project-row", [...sidebar.querySelectorAll('[role="listitem"][data-sidebar-project-kind] > span > [role="button"], [data-project-id], [data-testid*="project" i]')]);
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
  if (previous?.cleanup) previous.cleanup();
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mediaType = artDataUrl.slice(5, artDataUrl.indexOf(";")) || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mediaType }));
  })();

  const mediaUrls = {};
  const mediaInputs = {};
  const retainedMediaNodes = {};
  const playbackStates = new WeakMap();
  const mediaConfig = themeConfig?.media || {};
  const mediaTransform = (transform) => `scaleX(${transform?.flipHorizontal ? -1 : 1}) scaleY(${transform?.flipVertical ? -1 : 1})`;
  const mediaVideoId = (role) => `codex-dream-skin-${role}-video`;
  const mediaKey = (role) => String(mediaConfig?.[role]?.asset || `${themeConfig?.themeId || "theme"}:${role}`);
  const mediaInputId = (role) => `codex-dream-skin-media-${role}`;
  const prepareMedia = () => {
    const result = {};
    for (const role of ["hero", "polaroid", "conversationBackground"]) {
      const isVideo = role === "conversationBackground" ? mediaConfig?.[role]?.mode === "video" : mediaConfig?.[role]?.kind === "video";
      if (!isVideo) continue;
      let input = document.getElementById(mediaInputId(role));
      if (!(input instanceof HTMLInputElement)) {
        input?.remove();
        input = document.createElement("input");
        input.type = "file";
        input.id = mediaInputId(role);
        input.accept = mediaConfig[role]?.mimeType || "video/mp4,video/webm";
        input.hidden = true;
        input.setAttribute("aria-hidden", "true");
        (document.body || document.documentElement).appendChild(input);
      }
      mediaInputs[role] = input;
      result[role] = input.id;
    }
    return result;
  };
  const attachMedia = () => {
    for (const role of ["hero", "polaroid", "conversationBackground"]) {
      const input = mediaInputs[role] || document.getElementById(mediaInputId(role));
      const file = input instanceof HTMLInputElement ? input.files?.[0] : null;
      if (!file) continue;
      if (mediaUrls[role]) URL.revokeObjectURL(mediaUrls[role]);
      mediaUrls[role] = URL.createObjectURL(file);
    }
    ensure();
    return true;
  };
  window.__CODEX_DREAM_SKIN_PREPARE_MEDIA__ = prepareMedia;
  window.__CODEX_DREAM_SKIN_ATTACH_MEDIA__ = attachMedia;

  const clearPlaybackGuard = (video) => {
    const state = playbackStates.get(video);
    if (!state) return;
    if (state.timer) clearInterval(state.timer);
    if (state.frameRequest !== null && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(state.frameRequest);
    for (const [type, handler] of state.handlers || []) video.removeEventListener(type, handler);
    playbackStates.delete(video);
  };
  const installPlaybackGuard = (video, playback, showPlayButton) => {
    const configKey = JSON.stringify({ autoplay: Boolean(playback?.autoplay), loop: Boolean(playback?.loop), sound: Boolean(playback?.sound), volume: Number(playback?.volume) || 0 });
    const existing = playbackStates.get(video);
    if (!playback?.autoplay) {
      if (existing) clearPlaybackGuard(video);
      return { changed: Boolean(existing), showPlayButton };
    }
    if (existing?.configKey === configKey) {
      existing.showPlayButton = showPlayButton;
      if (existing.frameRequest === null) existing.requestFrame?.();
      return { changed: false, showPlayButton };
    }
    if (existing) clearPlaybackGuard(video);
    const now = performance.now();
    const state = {
      configKey,
      lastTime: video.currentTime,
      lastSignalAt: now,
      stalledSince: null,
      recovering: false,
      nextRecoveryAt: 0,
      detachedSince: null,
      sourceChanging: false,
      timer: null,
      frameRequest: null,
      handlers: [],
      requestFrame: null,
      showPlayButton
    };
    const noteProgress = () => {
      const current = video.currentTime;
      if (Number.isFinite(current) && Math.abs(current - state.lastTime) >= 0.01) {
        state.lastTime = current;
        state.lastSignalAt = performance.now();
        state.stalledSince = null;
        state.recovering = false;
      }
    };
    const requestFrame = () => {
      if (typeof video.requestVideoFrameCallback !== "function" || !video.isConnected) return;
      state.frameRequest = video.requestVideoFrameCallback((_now, metadata) => {
        if (!playbackStates.has(video)) return;
        const mediaTime = Number(metadata?.mediaTime);
        const nextTime = Number.isFinite(mediaTime) ? mediaTime : video.currentTime;
        if (Math.abs(nextTime - state.lastTime) >= 0.01) {
          state.lastTime = nextTime;
          state.lastSignalAt = performance.now();
          state.stalledSince = null;
          state.recovering = false;
        }
        requestFrame();
      });
    };
    const recover = () => {
      const recoveryNow = performance.now();
      if (state.recovering || recoveryNow < state.nextRecoveryAt || !video.isConnected || video.paused || video.ended || document.hidden) return;
      const resumeTime = video.currentTime;
      state.recovering = true;
      state.nextRecoveryAt = recoveryNow + 1800;
      try {
        video.pause();
        if (Number.isFinite(resumeTime) && video.readyState >= (Number(video.HAVE_METADATA) || 1)) video.currentTime = resumeTime;
      } catch {
        // Chromium can reject currentTime while the media element is replacing its source.
      }
      Promise.resolve(video.play()).then(() => {
        state.recovering = false;
        state.lastTime = video.currentTime;
        state.lastSignalAt = performance.now();
        state.stalledSince = null;
        requestFrame();
      }).catch(() => {
        state.recovering = false;
        state.stalledSince = performance.now();
        showPlayButton();
      });
    };
    state.timer = setInterval(() => {
      const timerNow = performance.now();
      if (!video.isConnected) {
        state.detachedSince ??= timerNow;
        if (state.frameRequest !== null && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(state.frameRequest);
        state.frameRequest = null;
        return;
      }
      state.detachedSince = null;
      if (state.frameRequest === null) requestFrame();
      if (video.paused || video.ended || document.hidden || video.readyState < (Number(video.HAVE_CURRENT_DATA) || 2)) {
        state.stalledSince = null;
        return;
      }
      noteProgress();
      if (timerNow - state.lastSignalAt < 1200) return;
      state.stalledSince ??= timerNow;
      if (timerNow - state.stalledSince >= 0) recover();
    }, 750);
    state.requestFrame = requestFrame;
    playbackStates.set(video, state);
    const onWaiting = () => { state.stalledSince ??= performance.now() - 1200; };
    const onStalled = () => { state.stalledSince ??= performance.now() - 1200; };
    state.handlers = [["timeupdate", noteProgress], ["playing", noteProgress], ["progress", noteProgress], ["waiting", onWaiting], ["stalled", onStalled]];
    for (const [type, handler] of state.handlers) video.addEventListener(type, handler);
    requestFrame();
    return { changed: true, showPlayButton };
  };
  const configureVideo = (video, playback) => {
    const configKey = JSON.stringify({ autoplay: Boolean(playback?.autoplay), loop: Boolean(playback?.loop), sound: Boolean(playback?.sound), volume: Number(playback?.volume) || 0 });
    const existing = playbackStates.get(video);
    if (existing?.configKey === configKey) return { changed: false, showPlayButton: existing.showPlayButton };
    video.autoplay = Boolean(playback?.autoplay);
    video.loop = Boolean(playback?.loop);
    video.muted = !Boolean(playback?.sound);
    video.volume = clamp(Number(playback?.volume) || 0, 0, 1);
    video.playsInline = true;
    video.controls = false;
    const showPlayButton = () => {
      if (!video.parentElement?.querySelector(".dream-media-play")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dream-media-play";
        button.textContent = "▶";
        button.setAttribute("aria-label", "播放媒体");
        button.addEventListener("click", () => { void video.play().catch(() => undefined); });
        video.parentElement?.appendChild(button);
      }
    };
    const resumeAutoplay = () => {
      if (!video.isConnected || document.hidden || video.dataset.dreamAutoplay !== "true") return;
      void video.play().catch(showPlayButton);
    };
    video.onplay = () => video.parentElement?.querySelector(".dream-media-play")?.remove();
    video.onpause = () => {
      const state = playbackStates.get(video);
      if (video.ended && !video.loop) showPlayButton();
      else if (!state?.recovering && !state?.sourceChanging && playback?.autoplay && !document.hidden) setTimeout(resumeAutoplay, 0);
    };
    video.onloadeddata = () => { if (playback?.autoplay && !document.hidden) void video.play().catch(showPlayButton); };
    video.oncanplay = () => { if (playback?.autoplay && !document.hidden) void video.play().catch(showPlayButton); };
    video.dataset.dreamAutoplay = playback?.autoplay ? "true" : "false";
    const guard = installPlaybackGuard(video, playback, showPlayButton);
    if (!playback?.autoplay) showPlayButton();
    return { changed: guard.changed, showPlayButton };
  };
  const resumePolaroidVideo = (polaroid) => {
    const video = polaroid?.querySelector?.(".dream-polaroid-video");
    if (!(video instanceof HTMLVideoElement) || video.dataset.dreamAutoplay !== "true" || document.hidden || !video.paused) return;
    void video.play().catch(() => undefined);
  };
  const keepHeroMediaOutOfLayoutAnchor = (hero, media) => {
    if (hero.firstElementChild === media) hero.appendChild(media);
  };
  const findExistingMediaVideo = (surface, role) => {
    const id = mediaVideoId(role);
    let video = surface.querySelector(`:scope > #${id}`) || surface.querySelector(`:scope > .dream-${role}-video`);
    if (!(video instanceof HTMLVideoElement)) {
      const detached = document.getElementById(id) || retainedMediaNodes[role];
      if (detached instanceof HTMLVideoElement) {
        video = detached;
        surface.appendChild(video);
      }
    }
    if (video instanceof HTMLVideoElement) {
      video.id = id;
      retainedMediaNodes[role] = video;
    }
    return video instanceof HTMLVideoElement ? video : null;
  };
  const setVideoSource = (video, role) => {
    const key = mediaKey(role);
    const source = mediaUrls[role] || mediaConfig?.[role]?.dataUrl || "";
    const changed = video.dataset.dreamMediaKey !== key || video.src !== source;
    if (!changed) return false;
    const state = playbackStates.get(video);
    if (state) state.sourceChanging = true;
    video.pause();
    video.dataset.dreamMediaKey = key;
    video.src = source;
    video.load();
    if (state) state.sourceChanging = false;
    return true;
  };
  const ensureHeroMedia = (hero) => {
    if (!(hero instanceof HTMLElement)) return;
    let video = findExistingMediaVideo(hero, "hero");
    let image = hero.querySelector(":scope > .dream-hero-image");
    if (!mediaConfig?.hero || !artUrl) {
      if (video instanceof HTMLVideoElement) clearPlaybackGuard(video);
      video?.remove();
      retainedMediaNodes.hero = null;
      image?.remove();
      return;
    }
    if (mediaConfig.hero.kind === "video") {
      image?.remove();
      if (!(video instanceof HTMLVideoElement)) {
        if (video instanceof HTMLVideoElement) clearPlaybackGuard(video);
        video?.remove();
        video = document.createElement("video");
        video.id = mediaVideoId("hero");
        video.className = "dream-hero-video";
        video.setAttribute("aria-hidden", "true");
        hero.appendChild(video);
        retainedMediaNodes.hero = video;
      }
      keepHeroMediaOutOfLayoutAnchor(hero, video);
      const sourceChanged = setVideoSource(video, "hero");
      video.style.transform = mediaTransform(mediaConfig.hero.transform);
      const configured = configureVideo(video, mediaConfig.hero.playback);
      if ((configured.changed || sourceChanged || video.paused) && mediaConfig.hero.playback?.autoplay && !document.hidden) video.play().catch(configured.showPlayButton);
      return;
    }
    if (video instanceof HTMLVideoElement) clearPlaybackGuard(video);
    video?.remove();
    retainedMediaNodes.hero = null;
    if (!(image instanceof HTMLElement)) {
      image?.remove();
      image = document.createElement("div");
      image.className = "dream-hero-image";
      image.setAttribute("aria-hidden", "true");
      hero.appendChild(image);
    }
    keepHeroMediaOutOfLayoutAnchor(hero, image);
    image.style.backgroundImage = `url("${artUrl}")`;
    image.style.backgroundRepeat = "no-repeat";
    image.style.backgroundSize = "var(--dream-art-scale, 100%) auto";
    image.style.backgroundPosition = "var(--dream-art-x, 50%) var(--dream-art-y, 50%)";
    image.style.transform = mediaTransform(mediaConfig.hero.transform);
  };
  const ensurePolaroidMedia = (surface) => {
    if (!(surface instanceof HTMLElement)) return;
    let video = findExistingMediaVideo(surface, "polaroid");
    if (mediaConfig?.polaroid?.kind !== "video" || !mediaUrls.polaroid) {
      if (video instanceof HTMLVideoElement) clearPlaybackGuard(video);
      video?.remove();
      retainedMediaNodes.polaroid = null;
      return;
    }
    if (!(video instanceof HTMLVideoElement)) {
      if (video instanceof HTMLVideoElement) clearPlaybackGuard(video);
      video?.remove();
      video = document.createElement("video");
      video.id = mediaVideoId("polaroid");
      video.className = "dream-polaroid-video";
      video.setAttribute("aria-hidden", "true");
      surface.appendChild(video);
      retainedMediaNodes.polaroid = video;
    }
    const sourceChanged = setVideoSource(video, "polaroid");
    video.style.transform = mediaTransform(mediaConfig.polaroid.transform);
    const configured = configureVideo(video, mediaConfig.polaroid.playback);
    if ((configured.changed || sourceChanged || video.paused) && mediaConfig.polaroid.playback?.autoplay && !document.hidden) video.play().catch(configured.showPlayButton);
  };

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

  const conversationBackgroundConfig = () => themeConfig?.media?.conversationBackground || null;
  const findConversationSurface = () => {
    const candidates = [...document.querySelectorAll('.thread-scroll-container[data-app-action-timeline-scroll]')];
    return candidates.find((candidate) => isVisible(candidate) && findComposer(candidate) && !candidate.closest('.dream-home')) || null;
  };
  const conversationViewport = (surface) => {
    const viewport = surface?.parentElement;
    if (!(viewport instanceof HTMLElement)) return null;
    return viewport.querySelector(':scope > .thread-scroll-container[data-app-action-timeline-scroll]') === surface ? viewport : null;
  };
  const clearConversationBackgroundNode = (background) => {
    if (!(background instanceof HTMLElement)) return;
    clearConversationBackgroundMedia(background);
    background.remove();
  };
  const clearConversationSurface = (surface) => {
    if (!(surface instanceof HTMLElement)) return;
    surface.classList.remove('dream-conversation-surface');
    const viewport = conversationViewport(surface) || surface.parentElement;
    viewport?.classList.remove('dream-conversation-viewport');
    const backgrounds = new Set([
      ...((viewport instanceof HTMLElement) ? viewport.querySelectorAll(':scope > .dream-conversation-background') : []),
      ...surface.querySelectorAll(':scope > .dream-conversation-background')
    ]);
    backgrounds.forEach(clearConversationBackgroundNode);
  };
  const clearConversationBackgroundMedia = (background) => {
    const video = background?.querySelector(':scope > .dream-conversation-background-video');
    if (video instanceof HTMLVideoElement) {
      clearPlaybackGuard(video);
      video.pause();
      retainedMediaNodes.conversationBackground = null;
    }
    background?.querySelector(':scope > .dream-conversation-background-media')?.remove();
  };
  const ensureConversationOverlay = (background, config) => {
    let overlay = background.querySelector(':scope > .dream-conversation-background-overlay');
    if (!(overlay instanceof HTMLElement)) {
      overlay = document.createElement('div');
      overlay.className = 'dream-conversation-background-overlay';
    }
    background.appendChild(overlay);
    const style = config?.overlayStyle && typeof config.overlayStyle === 'object' ? config.overlayStyle : {};
    const fallbackOpacity = `${clamp(Number(config?.overlayOpacity) || 0, 0, 1)}`;
    const properties = [
      ['background', 'background', typeof config?.overlayColor === 'string' ? config.overlayColor : '#FFFFFF'],
      ['opacity', 'opacity', fallbackOpacity],
      ['inset', 'inset', '0'],
      ['left', 'left', '0'],
      ['top', 'top', '0'],
      ['width', 'width', 'auto'],
      ['height', 'height', 'auto'],
      ['transform', 'transform', 'none'],
      ['borderRadius', 'border-radius', '0'],
      ['filter', 'filter', 'none']
    ];
    properties.forEach(([key, property, fallback]) => {
      setInlineStyle(overlay, property, typeof style[key] === 'string' ? style[key] : fallback);
    });
    return overlay;
  };
  const ensureConversationBackground = () => {
    const config = conversationBackgroundConfig();
    const configuredMode = typeof config?.mode === 'string' ? config.mode : 'color';
    const mode = configuredMode === 'image' || configuredMode === 'gif' || configuredMode === 'video' ? configuredMode : 'color';
    const visible = config?.visible === true;
    const source = mediaConfig?.conversationBackground?.dataUrl || mediaUrls.conversationBackground || '';
    const canRender = visible && (mode === 'color' || Boolean(source));
    const surface = findConversationSurface();
    const viewport = conversationViewport(surface);
    document.querySelectorAll('.dream-conversation-surface').forEach((current) => {
      if (!canRender || current !== surface) clearConversationSurface(current);
    });
    document.querySelectorAll('.dream-conversation-viewport').forEach((current) => {
      if (!canRender || current !== viewport) {
        current.classList.remove('dream-conversation-viewport');
        current.querySelectorAll(':scope > .dream-conversation-background').forEach(clearConversationBackgroundNode);
      }
    });
    if (!(surface instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !canRender) return;
    surface.classList.add('dream-conversation-surface');
    viewport.classList.add('dream-conversation-viewport');
    const backgroundCandidates = [
      ...viewport.querySelectorAll(':scope > .dream-conversation-background'),
      ...surface.querySelectorAll(':scope > .dream-conversation-background')
    ];
    let background = backgroundCandidates[0];
    backgroundCandidates.slice(1).forEach(clearConversationBackgroundNode);
    if (!(background instanceof HTMLElement)) {
      background = document.createElement('div');
      background.className = 'dream-conversation-background';
      background.setAttribute('aria-hidden', 'true');
    }
    if (background.parentElement !== viewport) viewport.prepend(background);
    if (background.dataset.dreamBackgroundMode !== configuredMode) background.dataset.dreamBackgroundMode = configuredMode;
    const opacity = clamp(Number(config?.opacity) || 0, 0, 1);
    const focusXValue = Number(config?.focus?.x);
    const focusYValue = Number(config?.focus?.y);
    const focusX = clamp(Number.isFinite(focusXValue) ? focusXValue : 0.5, 0, 1);
    const focusY = clamp(Number.isFinite(focusYValue) ? focusYValue : 0.5, 0, 1);
    const scale = clamp(Number(config?.scale) || 1, 1, 3);
    if (mode === 'color') {
      clearConversationBackgroundMedia(background);
      let color = background.querySelector(':scope > .dream-conversation-background-color');
      if (!(color instanceof HTMLElement)) {
        color = document.createElement('div');
        color.className = 'dream-conversation-background-color';
        background.appendChild(color);
      }
      setInlineStyle(color, 'background', typeof config?.color === 'string' ? config.color : 'var(--dream-main-surface)');
      setInlineStyle(color, 'opacity', `${opacity}`);
      ensureConversationOverlay(background, config);
      return;
    }
    background.querySelector(':scope > .dream-conversation-background-color')?.remove();
    let media = null;
    if (mode === 'video') {
      background.querySelector(':scope > .dream-conversation-background-media:not(.dream-conversation-background-video)')?.remove();
      let video = background.querySelector(':scope > .dream-conversation-background-video');
      if (!(video instanceof HTMLVideoElement)) {
        video?.remove();
        video = document.createElement('video');
        video.className = 'dream-conversation-background-media dream-conversation-background-video';
        video.id = mediaVideoId('conversationBackground');
        video.setAttribute('aria-hidden', 'true');
        video.muted = true;
        video.autoplay = true;
        video.loop = true;
        video.controls = false;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        background.appendChild(video);
      }
      retainedMediaNodes.conversationBackground = video;
      const sourceChanged = setVideoSource(video, 'conversationBackground');
      const playback = { autoplay: true, loop: true, sound: false, volume: 0 };
      const configured = configureVideo(video, playback);
      if ((configured.changed || sourceChanged || video.paused) && !document.hidden) video.play().catch(() => undefined);
      media = video;
    } else {
      const video = background.querySelector(':scope > .dream-conversation-background-video');
      if (video instanceof HTMLVideoElement) {
        clearPlaybackGuard(video);
        video.pause();
        video.remove();
      }
      retainedMediaNodes.conversationBackground = null;
      let image = background.querySelector(':scope > .dream-conversation-background-media:not(.dream-conversation-background-video)');
      if (!(image instanceof HTMLImageElement)) {
        image?.remove();
        image = document.createElement('img');
        image.className = 'dream-conversation-background-media';
        image.setAttribute('aria-hidden', 'true');
        image.alt = '';
        image.draggable = false;
        background.appendChild(image);
      }
      if (image.src !== source) image.src = source;
      media = image;
    }
    if (media instanceof HTMLElement) {
      setInlineStyle(media, 'object-position', `${focusX * 100}% ${focusY * 100}%`);
      setInlineStyle(media, 'opacity', `${opacity}`);
      setInlineStyle(media, 'transform', `scale(${scale})`);
    }
    ensureConversationOverlay(background, config);
  };

  const clearComposerSendIcon = (button) => {
    button?.classList.remove("dream-composer-send-button", "dream-composer-send-button-customized");
    button?.querySelector(":scope > .dream-composer-send-icon")?.remove();
  };

  const composerButtonLabel = (button) =>
    [button?.getAttribute("aria-label"), button?.getAttribute("title")]
      .filter((value) => typeof value === "string")
      .join(" ")
      .trim();

  const isComposerStopButton = (button) =>
    /(?:停止|取消|stop|cancel)/i.test(composerButtonLabel(button));

  const ensureComposerSendIcon = (composer) => {
    const buttons = composer ? [...composer.querySelectorAll("button")].filter(isVisible) : [];
    const labeledButton = buttons.find((button) => /^(?:发送|提交|停止|send|submit|stop)/i.test(composerButtonLabel(button)));
    const button = labeledButton || buttons.find((candidate) => candidate.classList.contains("bg-token-foreground")) || null;
    document.querySelectorAll(".dream-composer-send-button").forEach((current) => {
      if (current !== button) clearComposerSendIcon(current);
    });
    if (!(button instanceof HTMLElement) || isComposerStopButton(button)) {
      clearComposerSendIcon(button);
      return;
    }

    button.classList.add("dream-composer-send-button");
    const source = themeConfig?.icons?.composer;
    if (!source?.dataUrl && (!source?.name || source.name === "send")) {
      button.classList.remove("dream-composer-send-button-customized");
      button.querySelector(":scope > .dream-composer-send-icon")?.remove();
      return;
    }

    let icon = button.querySelector(":scope > .dream-composer-send-icon");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "dream-composer-send-icon";
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);
    }
    button.classList.add("dream-composer-send-button-customized");
    renderSlot(icon, "composer", "↑");
  };

  let livePolaroidPlacement = null;
  let chromeRoot = null;
  const setPolaroidPlacement = (polaroid, x, y) => {
    polaroid.style.setProperty("right", "auto", "important");
    polaroid.style.setProperty("left", `${x * 100}%`, "important");
    polaroid.style.setProperty("top", `${y * 100}%`, "important");
  };
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
      resumePolaroidVideo(polaroid);
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
      livePolaroidPlacement = { x: drag.x, y: drag.y };
      setPolaroidPlacement(polaroid, drag.x, drag.y);
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
    const region = heading?.parentElement;
    region?.classList.remove("dream-heading-region", "dream-heading-region-decorated");
    region?.removeAttribute("data-dream-heading-density");
    region?.removeAttribute("data-dream-heading-measure-key");
    region?.querySelector(`#${HEADING_DECORATION_ID}`)?.remove();
  };

  const projectLabel = (button) => button?.textContent?.replace(/\s+/g, " ").trim() || "";

  const activateProjectButton = (sourceButton, proxy) => {
    if (!(sourceButton instanceof HTMLElement)) return;
    sourceButton.focus?.({ preventScroll: true });
    projectAnchorRestorers.get(sourceButton)?.();
    const proxyRect = proxy?.getBoundingClientRect?.();
    const canAlignAnchor = proxyRect && proxyRect.width > 0 && proxyRect.height > 0;
    const hadOwnRect = Object.prototype.hasOwnProperty.call(sourceButton, "getBoundingClientRect");
    const originalRect = sourceButton.getBoundingClientRect;
    let checkAnchorState = null;
    if (canAlignAnchor) {
      let stateObserver = null;
      const isOpen = () => sourceButton.getAttribute("aria-expanded") === "true" ||
        sourceButton.getAttribute("data-state") === "open";
      let sawOpenState = isOpen();
      const directPointerDown = (event) => {
        if (event.isTrusted) restoreAnchor();
      };
      const restoreAnchor = () => {
        if (projectAnchorRestorers.get(sourceButton) !== restoreAnchor) return;
        stateObserver?.disconnect();
        sourceButton.removeEventListener("pointerdown", directPointerDown, true);
        if (hadOwnRect) sourceButton.getBoundingClientRect = originalRect;
        else delete sourceButton.getBoundingClientRect;
        projectAnchorRestorers.delete(sourceButton);
      };
      checkAnchorState = () => {
        if (isOpen()) sawOpenState = true;
        else if (sawOpenState) restoreAnchor();
      };
      sourceButton.getBoundingClientRect = () => proxyRect;
      projectAnchorRestorers.set(sourceButton, restoreAnchor);
      stateObserver = new MutationObserver(checkAnchorState);
      stateObserver.observe(sourceButton, { attributes: true, attributeFilter: ["aria-expanded", "data-state"] });
      sourceButton.addEventListener("pointerdown", directPointerDown, true);
    }
    const pointerEvent = window.PointerEvent || window.MouseEvent;
    const expandedBefore = sourceButton.getAttribute("aria-expanded");
    const pointerDown = new pointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      pointerType: "mouse",
    });
    sourceButton.dispatchEvent(pointerDown);
    sourceButton.dispatchEvent(new pointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 0,
      pointerType: "mouse",
    }));
    if (!pointerDown.defaultPrevented && expandedBefore === sourceButton.getAttribute("aria-expanded")) {
      sourceButton.click();
    }
    checkAnchorState?.();
  };

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
    }
    const resolveSourceButton = () => {
      const home = heading.closest('[role="main"]');
      return findVisible(home || document, '[data-composer-navigation-target="workspace-project"]') || sourceButton;
    };
    proxy.onpointerdown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      activateProjectButton(resolveSourceButton(), proxy);
    };
    proxy.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail === 0) activateProjectButton(resolveSourceButton(), proxy);
    };
    if (proxy.textContent !== label) proxy.textContent = label;
    return proxy;
  };

  const ensureHeadingDecoration = (heading) => {
    const region = heading?.parentElement;
    const config = themeConfig?.decorations?.homeHeading;
    const text = typeof config?.text === "string" ? config.text : "♫ · ✦ · ♡";
    if (!region || config?.visible === false || !text) {
      document.getElementById(HEADING_DECORATION_ID)?.remove();
      region?.classList.remove("dream-heading-region-decorated");
      region?.removeAttribute("data-dream-heading-density");
      region?.removeAttribute("data-dream-heading-measure-key");
      return null;
    }
    document.querySelectorAll(".dream-heading-decoration").forEach((node) => {
      if (node.id !== HEADING_DECORATION_ID || node.parentElement !== region) node.remove();
    });
    let decoration = document.getElementById(HEADING_DECORATION_ID);
    if (!decoration || decoration.parentElement !== region) {
      decoration?.remove();
      decoration = document.createElement("span");
      decoration.id = HEADING_DECORATION_ID;
      decoration.className = "dream-heading-decoration";
      decoration.setAttribute("aria-hidden", "true");
      region.insertBefore(decoration, heading);
    }
    decoration.textContent = text;
    decoration.style.fontSize = `${clamp(Number(config?.fontSize) || 17, 10, 32)}px`;
    region.classList.add("dream-heading-region-decorated");
    return decoration;
  };

  const fitHeadingDensity = (heading, hero, actionGrid) => {
    const region = heading?.parentElement;
    if (!region || !hero) return;
    const decoration = region.querySelector(`#${HEADING_DECORATION_ID}`);
    if (!decoration) {
      region.removeAttribute("data-dream-heading-density");
      region.removeAttribute("data-dream-heading-measure-key");
      return;
    }
    const project = projectLabel(heading.querySelector(".dream-project-selector"));
    const heroBox = hero.getBoundingClientRect();
    const key = `${VERSION}|${Math.round(heroBox.width)}|${project}|${decoration.textContent}|${decoration.style.fontSize}`;
    if (region.dataset.dreamHeadingMeasureKey === key) return;
    const regionBox = region.getBoundingClientRect();
    const gridBox = actionGrid?.getBoundingClientRect?.();
    const limit = gridBox && gridBox.top > regionBox.top ? gridBox.top - 10 : regionBox.bottom;
    const densities = ["normal", "compact", "condensed"];
    let selected = densities[densities.length - 1];
    for (const density of densities) {
      region.dataset.dreamHeadingDensity = density;
      const headingBox = heading.getBoundingClientRect();
      const decorationBox = decoration.getBoundingClientRect();
      if (Math.max(headingBox.bottom, decorationBox.bottom) <= limit && heading.scrollHeight <= region.clientHeight) {
        selected = density;
        break;
      }
    }
    region.dataset.dreamHeadingDensity = selected;
    region.dataset.dreamHeadingMeasureKey = key;
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
    ensureHeadingDecoration(heading);
    return heading;
  };

  const clearHomeLayout = () => {
    document.querySelectorAll(".dream-hero-video, .dream-hero-image").forEach((node) => {
      if (node instanceof HTMLVideoElement) {
        retainedMediaNodes.hero = node;
        node.remove();
      } else {
        node.remove();
      }
    });
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
    root.style.setProperty("--dream-art", "none");

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
      const actionGrid = ensureActionGrid(hero);
      fitHeadingDensity(heading, hero, actionGrid);
      const quickBanner = findQuickModeBanner(home);
      markCurrentNode(".dream-quick-mode-banner", quickBanner, "dream-quick-mode-banner");

      const projectBar = context.projectButton?.closest(".horizontal-scroll-fade-mask")?.parentElement ||
        context.projectButton?.parentElement || null;
      markCurrentNode(".dream-project-bar", projectBar, "dream-project-bar");
      const nativeSuggestions = home.querySelector('[data-home-ambient-suggestions="true"], [data-home-ambient-suggestions]');
      markCurrentNode(".dream-native-suggestions", nativeSuggestions, "dream-native-suggestions");
      ensureHeroMedia(hero);
    } else {
      clearHomeLayout();
    }

    const composerSurface = context?.composerSurface || findVisible(document, ".composer-surface-chrome");
    markCurrentNode(".composer-surface-chrome.dream-composer", composerSurface, "dream-composer");
    ensureComposerBadge(composerSurface);
    ensureComposerMelody(composerSurface);
    ensureComposerSendIcon(composerSurface);
    ensureConversationBackground();

    if (!shellMain || !document.body) return;
    let chrome = document.getElementById(CHROME_ID) || chromeRoot;
    if (!chrome || chrome.parentElement !== document.body) {
      if (chrome instanceof HTMLElement) {
        document.body.appendChild(chrome);
      } else {
        chrome = document.createElement("div");
        chrome.id = CHROME_ID;
        chrome.setAttribute("aria-hidden", "true");
        chrome.innerHTML = `
          <div class="dream-brand"><span class="dream-note">♫</span><span><b></b><small></small></span></div>
          <div class="dream-signature"></div>
          <div class="dream-sparkles" aria-hidden="true"></div>
          <div class="dream-polaroid"><div class="dream-polaroid-shadow"><div class="dream-polaroid-surface"></div></div></div>`;
        document.body.appendChild(chrome);
      }
    }
    chromeRoot = chrome;
    renderSlot(chrome.querySelector(".dream-note"), "branding", "♫");
    const copy = themeConfig?.copy || {};
    const brandTitle = chrome.querySelector(".dream-brand b");
    const brandSubtitle = chrome.querySelector(".dream-brand small");
    const brandSignature = chrome.querySelector(".dream-signature");
    if (brandTitle) brandTitle.textContent = typeof copy.brandTitle === "string" ? copy.brandTitle : "初音未来主题 Codex App";
    if (brandSubtitle) brandSubtitle.textContent = typeof copy.brandSubtitle === "string" ? copy.brandSubtitle : "你的专属 AI 编程与创作伙伴";
    if (brandSignature) brandSignature.textContent = typeof copy.brandSignature === "string" ? copy.brandSignature : "MIKU ✦ 01";
    chrome.querySelectorAll(".dream-wave").forEach((node) => node.remove());
    const polaroid = chrome.querySelector(".dream-polaroid");
    if (polaroid) {
      let shadow = polaroid.querySelector(":scope > .dream-polaroid-shadow");
      if (!(shadow instanceof HTMLElement)) {
        shadow = document.createElement("div");
        shadow.className = "dream-polaroid-shadow";
        polaroid.prepend(shadow);
      }
      let surface = shadow.querySelector(":scope > .dream-polaroid-surface");
      if (!(surface instanceof HTMLElement)) {
        surface = document.createElement("div");
        surface.className = "dream-polaroid-surface";
        shadow.appendChild(surface);
      }
      ensurePolaroidMedia(surface);
    }
    let pin = chrome.querySelector(".dream-polaroid-pin");
    if (!pin) {
      pin = document.createElement("span");
      pin.className = "dream-polaroid-pin";
      polaroid?.appendChild(pin);
    }
    renderSlot(pin, "polaroidPin", "●");
    installPolaroidDragging(chrome, chrome.querySelector(".dream-polaroid"));
    const currentPolaroid = chrome.querySelector(":scope > .dream-polaroid");
    if (livePolaroidPlacement && currentPolaroid instanceof HTMLElement) {
      setPolaroidPlacement(currentPolaroid, livePolaroidPlacement.x, livePolaroidPlacement.y);
    }

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
    } else {
      chrome.style.removeProperty("--dream-polaroid-top");
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
    document.querySelectorAll(".dream-heading-region").forEach((node) => {
      node.classList.remove("dream-heading-region", "dream-heading-region-decorated");
      node.removeAttribute("data-dream-heading-density");
      node.removeAttribute("data-dream-heading-measure-key");
    });
    document.querySelectorAll(".dream-heading-decoration").forEach((node) => node.remove());
    document.querySelectorAll(".dream-project-selector").forEach((node) => node.classList.remove("dream-project-selector"));
    document.querySelectorAll(".dream-project-bar").forEach((node) => node.classList.remove("dream-project-bar"));
    document.querySelectorAll(".dream-composer").forEach((node) => node.classList.remove("dream-composer"));
    document.querySelectorAll(".dream-composer-badge").forEach((node) => node.remove());
    document.querySelectorAll(".dream-composer-melody").forEach((node) => node.remove());
    document.querySelectorAll(".dream-composer-send-button").forEach(clearComposerSendIcon);
    document.querySelectorAll(".dream-conversation-surface").forEach(clearConversationSurface);
    document.querySelectorAll(".dream-conversation-viewport").forEach((node) => {
      node.classList.remove("dream-conversation-viewport");
      node.querySelectorAll(":scope > .dream-conversation-background").forEach(clearConversationBackgroundNode);
    });
    document.querySelectorAll(".dream-sparkles").forEach((node) => node.remove());
    document.querySelectorAll(".dream-wave").forEach((node) => node.remove());
    document.querySelectorAll(".dream-quick-mode-banner").forEach((node) => node.classList.remove("dream-quick-mode-banner"));
    document.querySelectorAll(".dream-native-suggestions").forEach((node) => node.classList.remove("dream-native-suggestions"));
    document.querySelectorAll(".dream-sidebar-mode-button").forEach(clearSidebarModeIcon);
    document.querySelectorAll("[data-dream-sidebar-nav]").forEach((node) => { if (node instanceof HTMLElement) restoreSidebarNav(node); node.removeAttribute("data-dream-sidebar-nav"); });
    for (const [labelNode, record] of sidebarCopyRestorers) {
      if (labelNode.isConnected) labelNode.textContent = record.text;
      if (record.button?.isConnected) {
        if (record.ariaLabel === null) record.button.removeAttribute("aria-label");
        else record.button.setAttribute("aria-label", record.ariaLabel);
      }
      sidebarCopyRestorers.delete(labelNode);
    }
    for (const className of ["dream-sidebar-header", "dream-sidebar-search-button", "dream-sidebar-project-row", "dream-sidebar-project-row-selected", "dream-sidebar-task-row", "dream-sidebar-task-row-selected", "dream-sidebar-footer", "dream-sidebar-avatar", "dream-sidebar-new-task-row", "dream-sidebar-new-task-row-selected", ...sidebarNavigation.flatMap((item) => [`dream-sidebar-nav-${item.id}`, `dream-sidebar-nav-${item.id}-selected`])]) {
      document.querySelectorAll(`.${className}`).forEach((node) => node.classList.remove(className));
    }
    document.getElementById(PROJECT_PROXY_ID)?.remove();
    document.getElementById(CARD_GRID_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    chromeRoot = null;
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.visibilityHandler) document.removeEventListener("visibilitychange", state.visibilityHandler);
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    for (const url of Object.values(mediaUrls)) if (url) URL.revokeObjectURL(url);
    const mediaNodes = new Set([...document.querySelectorAll(".dream-hero-video, .dream-hero-image, .dream-polaroid-video, .dream-conversation-background-video"), ...Object.values(retainedMediaNodes)]);
    mediaNodes.forEach((node) => { if (node instanceof HTMLVideoElement) clearPlaybackGuard(node); if (node instanceof HTMLMediaElement) node.pause(); if (node instanceof Element) node.remove(); });
    retainedMediaNodes.hero = null;
    retainedMediaNodes.polaroid = null;
    retainedMediaNodes.conversationBackground = null;
    document.querySelectorAll("input[id^='codex-dream-skin-media-']").forEach((node) => node.remove());
    delete window.__CODEX_DREAM_SKIN_PREPARE_MEDIA__;
    delete window.__CODEX_DREAM_SKIN_ATTACH_MEDIA__;
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const visibilityHandler = () => {
    const videos = new Set([...document.querySelectorAll(".dream-hero-video, .dream-polaroid-video, .dream-conversation-background-video"), ...Object.values(retainedMediaNodes)]);
    videos.forEach((node) => {
      if (!(node instanceof HTMLVideoElement)) return;
      if (document.hidden) node.pause();
      else if (node.dataset.dreamAutoplay === "true") void node.play().catch(() => undefined);
    });
  };
  document.addEventListener("visibilitychange", visibilityHandler);
  const scheduleEnsure = () => {
    if (scheduler.timeout) return;
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  const observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return !target?.closest(`#${CHROME_ID}`);
    });
    if (relevant) scheduleEnsure();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const resizeHandler = scheduleEnsure;
  window.addEventListener("resize", resizeHandler);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      document.querySelectorAll(".dream-heading-region").forEach((node) => node.removeAttribute("data-dream-heading-measure-key"));
      scheduleEnsure();
    }).catch(() => undefined);
  }
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure,
    cleanup,
    populateComposer,
    observer,
    resizeHandler,
    timer,
    scheduler,
    artUrl,
    mediaUrls,
    visibilityHandler,
    version: VERSION,
  };
  ensure();
  return { installed: true, version: VERSION };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_CONFIG_JSON__)
