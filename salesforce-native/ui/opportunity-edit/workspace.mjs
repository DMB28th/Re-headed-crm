const preferredHeight = 500;
// Presentation only: host measurements never become execution authority.
export function applyWorkspaceContext(document, context = {}) {
  const root = document.documentElement,
    style = root.style;
  const dimensions = context.containerDimensions || {};
  const checked = (value) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 10000
      ? value
      : null;
  if (Object.hasOwn(context, 'containerDimensions')) {
    // A maximum is a ceiling, not an instruction to fill a tall chat viewport.
    const fixedHeight = checked(dimensions.height),
      maximumHeight = checked(dimensions.maxHeight);
    const height =
      fixedHeight ??
      (maximumHeight === null
        ? null
        : Math.min(preferredHeight, maximumHeight));
    const width = checked(dimensions.width ?? dimensions.maxWidth);
    for (const [name, value] of [
      ['height', height],
      ['max-width', width],
    ]) {
      if (value === null) style.removeProperty(`--workspace-${name}`);
      else style.setProperty(`--workspace-${name}`, `${value}px`);
    }
  }
  if (context.safeAreaInsets) {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const value = context.safeAreaInsets[side];
      style.setProperty(
        `--workspace-safe-${side}`,
        `${typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0}px`,
      );
    }
  }
  const height = checked(
    parseFloat(style.getPropertyValue('--workspace-height')),
  );
  const insets = ['top', 'bottom'].reduce(
    (total, side) =>
      total +
      (style.getPropertyValue(`--workspace-safe-${side}`)
        ? parseFloat(style.getPropertyValue(`--workspace-safe-${side}`))
        : 12),
    0,
  );
  root.dataset.workspaceSize =
    height !== null && height - insets < 240 ? 'flow' : 'bounded';
}

export function workspaceChromeFits(available, header, actions) {
  return available - header - actions >= 96;
}
// Compare measured chrome against the stable declared/fallback envelope, never
// the flowing shell's new height. This prevents resize feedback from toggling it.
export function updateWorkspaceFit(document, shell) {
  if (!shell.isConnected) return;
  const style = document.defaultView.getComputedStyle(document.documentElement);
  const dimension =
    parseFloat(style.getPropertyValue('--workspace-height')) || preferredHeight;
  const inset = (side) => {
    const value = style.getPropertyValue(`--workspace-safe-${side}`);
    return value.trim() ? parseFloat(value) : 12;
  };
  const available = dimension - inset('top') - inset('bottom');
  const header = shell.children[0].getBoundingClientRect().height;
  const actions = shell.children[2].getBoundingClientRect().height;
  shell.dataset.chromeFit = workspaceChromeFits(available, header, actions)
    ? 'bounded'
    : 'flow';
}
