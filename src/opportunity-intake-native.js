/* global browser, messenger */
(function initOpportunityIntakeNative(global) {
  "use strict";

  const api = global.messenger || global.browser;
  const HOST_NAME = "com.lianggu.thunderbird_intake";
  const CHUNK_BYTES = 384 * 1024;
  const pending = new Map();
  let port = null;

  function nativeError(reason, message) {
    const error = new Error(message || reason);
    error.reason = reason;
    return error;
  }

  function ensurePort() {
    if (port) return port;
    if (!api?.runtime?.connectNative) {
      throw nativeError("native_host_not_supported", "当前 Thunderbird 不支持本机商机助手。");
    }
    port = api.runtime.connectNative(HOST_NAME);
    port.onMessage.addListener(message => {
      const waiter = pending.get(message?.nonce);
      if (!waiter) return;
      pending.delete(message.nonce);
      clearTimeout(waiter.timer);
      if (message.error) {
        waiter.reject(nativeError(
          message.error.reason || "native_host_error",
          message.error.message || "本机商机助手执行失败。"
        ));
      } else {
        waiter.resolve(message);
      }
    });
    port.onDisconnect.addListener(() => {
      const message = api.runtime.lastError?.message || "本机商机助手未连接。";
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(nativeError("native_host_disconnected", message));
      }
      pending.clear();
      port = null;
    });
    return port;
  }

  function rpc(message, timeoutMs = 15000) {
    const activePort = ensurePort();
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(nonce);
        reject(nativeError("native_host_timeout", "本机商机流程处理超时。"));
      }, timeoutMs);
      pending.set(nonce, { resolve, reject, timer });
      activePort.postMessage({ ...message, nonce, v: 1 });
    });
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const segment = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += segment) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(offset, Math.min(offset + segment, bytes.length))
      );
    }
    return btoa(binary);
  }

  async function sha256Hex(bytes) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
  }

  async function submitEmailWorkflow(bytes, config) {
    if (!(bytes instanceof Uint8Array) || !bytes.length) {
      throw nativeError("empty_email", "当前邮件内容为空。");
    }
    const workflow = config?.workflow || "opportunity_intake";
    const mode = config?.mode || "apply";

    const started = await rpc({ type: "begin_email", size: bytes.length });
    const sessionId = started.sessionId;
    try {
      let chunkId = 0;
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length));
        await rpc({
          type: "write_chunk",
          sessionId,
          chunkId,
          data: bytesToBase64(chunk)
        });
        chunkId += 1;
      }
      return await rpc({
        type: "commit_email",
        sessionId,
        sha256: await sha256Hex(bytes),
        workflow,
        mode,
        autoUpdate: config?.autoUpdate === true
      }, config?.timeoutMs || 430000);
    } catch (error) {
      try {
        await rpc({ type: "abort_email", sessionId }, 5000);
      } catch (_) {
        // The helper may already have removed its staging file.
      }
      throw error;
    }
  }

  async function submitEmail(bytes, mode = "apply") {
    if (!["apply", "dry_run"].includes(mode)) {
      throw nativeError("invalid_intake_mode", "不支持的商机处理模式。");
    }
    return submitEmailWorkflow(bytes, {
      workflow: "opportunity_intake",
      mode
    });
  }

  async function analyzeCustomer(bytes, options = {}) {
    return submitEmailWorkflow(bytes, {
      workflow: "customer_intelligence",
      mode: options.force ? "refresh" : "auto",
      autoUpdate: options.autoUpdate === true,
      timeoutMs: 430000
    });
  }

  global.LiangguOpportunityIntake = {
    HOST_NAME,
    submitEmail,
    analyzeCustomer
  };
})(globalThis);
