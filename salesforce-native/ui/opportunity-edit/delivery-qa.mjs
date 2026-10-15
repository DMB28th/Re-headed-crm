// Developer artifact only. The ordinary build leaves this capability disabled.
// This interrupts delivery of real SDK results; it never supplies server authority.
const confirmTools = new Set([
  'cardstack_record_edit_transition',
  'cardstack_opportunity_edit_transition',
  'cardstack_record_flow_transition',
]);
const failure = code => Object.assign(new Error(
  code === 'CARDSTACK_QA_REPLY_DISCARDED'
    ? 'Developer QA discarded the real Confirm reply. Use the existing recovery action.'
    : 'Developer QA reset interrupted delivery.'
), { code });

export function createDeliveryQa(sdk, { enabled = false } = {}) {
  let active = enabled === true, discardArmed = false, holdArmed = false;
  let generation = 0, waiting = false, held = null;
  const subscribers = new Set();
  const state = () => Object.freeze({ enabled: active, discardArmed, holdArmed,
    waiting, held: held !== null });
  const notify = () => {
    const snapshot = state();
    for (const listener of subscribers) {
      // Observer failures must never alter delivery or native execution.
      try { listener(snapshot); } catch { /* isolated observer */ }
    }
  };
  async function callServerTool(...args) {
    const request = args[0];
    const discard = active && discardArmed && confirmTools.has(request?.name)
      && request?.arguments?.operation === 'confirm';
    const hold = active && holdArmed && request?.name === 'cardstack_record_related_page';
    const epoch = generation;
    if (discard) discardArmed = false;
    if (hold) { holdArmed = false; waiting = true; }
    if (discard || hold) notify();
    let result;
    try {
      // Exactly one native invocation, with the original arguments and SDK receiver.
      result = await Reflect.apply(sdk.callServerTool, sdk, args);
    } catch (error) {
      if (hold && epoch === generation) { waiting = false; notify(); }
      throw error;
    }
    if ((discard || hold) && epoch !== generation) throw failure('CARDSTACK_QA_RESET');
    if (discard) throw failure('CARDSTACK_QA_REPLY_DISCARDED');
    if (!hold) return result;
    waiting = false;
    return new Promise((resolve, reject) => {
      held = { resolve, reject, result };
      notify();
    });
  }
  const app = active ? new Proxy(sdk, {
    get(target, key) {
      if (key === 'callServerTool') return callServerTool;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) { return Reflect.set(target, key, value, target); },
  }) : sdk;
  const reset = () => {
    generation++; discardArmed = false; holdArmed = false; waiting = false;
    const pending = held; held = null;
    if (pending) pending.reject(failure('CARDSTACK_QA_RESET'));
    notify();
  };
  return Object.freeze({ app, state,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A state listener is required.');
      subscribers.add(listener); listener(state());
      return () => subscribers.delete(listener);
    },
    armDiscardConfirm() {
      if (!active || discardArmed) return false;
      discardArmed = true; notify(); return true;
    },
    armHoldRelatedPage() {
      if (!active || holdArmed || waiting || held) return false;
      holdArmed = true; notify(); return true;
    },
    release() {
      if (!held) return false;
      const pending = held; held = null;
      pending.resolve(pending.result); notify(); return true;
    },
    reset,
    dispose() { active = false; reset(); subscribers.clear(); },
  });
}
