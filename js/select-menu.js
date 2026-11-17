/* 深色下拉菜单；原生 select 保留为选项与 change 事件的数据源。 */
let menuSequence = 0;
let activeClose = null;
export function mountSelect(select) {
  if (!select || select.dataset.enhanced) return () => {};
  select.dataset.enhanced = "1";
  const wrapper = document.createElement("span");
  wrapper.className = "select-menu";
  select.before(wrapper);
  wrapper.appendChild(select);
  select.hidden = true;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "select-menu-trigger";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "选择");
  const listId = `select-menu-${++menuSequence}`;
  trigger.setAttribute("aria-controls", listId);
  const value = document.createElement("span");
  value.className = "select-menu-value";
  const arrow = document.createElement("span");
  arrow.className = "select-menu-arrow";
  arrow.setAttribute("aria-hidden", "true");
  trigger.append(value, arrow);
  wrapper.appendChild(trigger);
  let list = null;
  let highlighted = -1;
  let typeBuffer = "";
  let typeTimer = 0;
  const refresh = () => {
    value.textContent = select.selectedOptions[0]?.textContent || "请选择";
    trigger.disabled = select.disabled;
  };
  function close() {
    if (!list) return;
    list.remove(); list = null;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", close);
    if (activeClose === close) activeClose = null;
  }
  function outside(event) { if (!wrapper.contains(event.target) && !list?.contains(event.target)) close(); }
  function onScroll(event) { if (list && !list.contains(event.target)) close(); }
  function move(index) {
    if (!list) return;
    const options = [...select.options];
    if (!options.length) return;
    highlighted = Math.max(0, Math.min(index, options.length - 1));
    const entries = [...list.children];
    entries.forEach((item, i) => item.classList.toggle("is-highlighted", i === highlighted));
    const item = entries[highlighted];
    if (item) { trigger.setAttribute("aria-activedescendant", item.id); item.scrollIntoView({ block: "nearest" }); }
  }
  function choose(index) {
    const option = select.options[index];
    if (!option || option.disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    refresh(); close();
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
    trigger.focus({ preventScroll: true });
  }
  function open() {
    if (trigger.disabled || list) return;
    activeClose?.();
    list = document.createElement("div");
    list.className = "select-menu-list";
    list.id = listId;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", trigger.getAttribute("aria-label"));
    [...select.options].forEach((option, index) => {
      const item = document.createElement("div");
      item.className = "select-menu-option";
      item.id = `${listId}-option-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(index === select.selectedIndex));
      if (option.disabled) item.setAttribute("aria-disabled", "true");
      item.textContent = option.textContent;
      item.addEventListener("pointermove", () => { if (!option.disabled && index !== highlighted) move(index); });
      item.addEventListener("click", event => { event.preventDefault(); if (!option.disabled) choose(index); });
      list.appendChild(item);
    });
    document.body.appendChild(list);
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const showAbove = below < 150 && above > below;
    const available = Math.max(60, showAbove ? above : below);
    list.style.maxHeight = `${Math.min(280, available - 6)}px`;
    list.style.minWidth = `${Math.round(rect.width)}px`;
    list.style.maxWidth = `${Math.max(100, window.innerWidth - 24)}px`;
    list.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - list.offsetWidth - 12))}px`;
    if (showAbove) list.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    else list.style.top = `${rect.bottom + 6}px`;
    trigger.setAttribute("aria-expanded", "true");
    activeClose = close;
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    move(Math.max(0, select.selectedIndex));
  }
  trigger.addEventListener("click", event => { event.preventDefault(); if (list) close(); else open(); });
  trigger.addEventListener("keydown", event => {
    if (event.key === "Escape" && list) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === "Tab") { close(); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!list) { open(); return; }
      if (event.key === "Enter" || event.key === " ") { choose(highlighted); return; }
      const options = [...select.options];
      let next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : highlighted + (event.key === "ArrowDown" ? 1 : -1);
      const direction = event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
      while (next >= 0 && next < options.length && options[next].disabled) next += direction;
      if (next >= 0 && next < options.length) move(next);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeBuffer += event.key.toLocaleLowerCase(); clearTimeout(typeTimer);
      typeTimer = setTimeout(() => { typeBuffer = ""; }, 700);
      if (!list) open();
      const index = [...select.options].findIndex(option => !option.disabled && option.textContent.trim().toLocaleLowerCase().startsWith(typeBuffer));
      if (index >= 0) move(index);
    }
  });
  select.addEventListener("change", refresh);
  const observer = new MutationObserver(() => { refresh(); if (list) close(); });
  observer.observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
  refresh();
  return () => { close(); clearTimeout(typeTimer); observer.disconnect(); select.removeEventListener("change", refresh); };
}
