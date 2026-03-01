(async function () {
  const TIMEOUT_MS = 2000;
  const POLL_MS = 25;
  const SCROLL_STEP = 1400;
  const SCROLL_PAUSE_MS = 120;
  const MAX_IDLE_SCROLLS = 12;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getChannelName(channel) {
    return (
      channel.querySelector("#channel-title")?.innerText?.trim() ||
      channel.querySelector("a#main-link")?.innerText?.trim() ||
      "(unknown channel)"
    );
  }

  function getSubscribeButton(channel) {
    return channel.querySelector("ytd-subscribe-button-renderer button");
  }

  function findConfirmButton() {
    return document.querySelector("yt-confirm-dialog-renderer #confirm-button button");
  }

  // Fast wait (polling) — simpler + very reliable across YouTube DOM changes
  async function waitFor(getter, timeoutMs = TIMEOUT_MS) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const v = getter();
      if (v) return v;
      await sleep(POLL_MS);
    }
    return null;
  }

  async function waitUntilGone(selector, timeoutMs = TIMEOUT_MS) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      if (!document.querySelector(selector)) return true;
      await sleep(POLL_MS);
    }
    return false;
  }

  async function tryUnsubscribe(channel) {
    const btn = getSubscribeButton(channel);
    if (!btn) return { ok: false, reason: "no button" };

    // Click regardless of state (handles any language / label)
    btn.click();

    // If a confirm dialog appears, confirm immediately.
    const confirmBtn = await waitFor(() => findConfirmButton(), TIMEOUT_MS);

    if (!confirmBtn) {
      // No dialog => either already unsubscribed, UI variant, or click didn’t open modal.
      return { ok: false, reason: "no confirm dialog (skipping)" };
    }

    confirmBtn.click();

    // Ensure modal disappears before continuing (avoids races)
    await waitUntilGone("yt-confirm-dialog-renderer", TIMEOUT_MS);

    return { ok: true };
  }

  const processed = new WeakSet();

  function collectUnprocessedChannels() {
    return Array.from(document.querySelectorAll("ytd-channel-renderer")).filter((ch) => !processed.has(ch));
  }

  async function processVisibleBatch() {
    const batch = collectUnprocessedChannels();
    for (const ch of batch) {
      processed.add(ch);
      const name = getChannelName(ch);

      const res = await tryUnsubscribe(ch);
      if (res.ok) console.log(`✅ Unsubscribed: ${name}`);
      else console.log(`↩️ ${name}: ${res.reason}`);
    }
    return batch.length;
  }

  async function autoScrollAndRun() {
    let idle = 0;

    while (idle < MAX_IDLE_SCROLLS) {
      const before = document.querySelectorAll("ytd-channel-renderer").length;

      await processVisibleBatch();

      window.scrollBy(0, SCROLL_STEP);
      await sleep(SCROLL_PAUSE_MS);

      const after = document.querySelectorAll("ytd-channel-renderer").length;

      if (after > before) idle = 0;
      else idle++;
    }

    console.log("🏁 Done (stopped after no new channels loaded).");
  }

  await autoScrollAndRun();
})();