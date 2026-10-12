<script lang="ts">
  import { onMount } from "svelte";
  import { emit, listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { LOCALES, locale, setLocale, t, tr, type LocaleCode } from "$lib/i18n";
  import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
  import type {
    AppSettings,
    AudioInputDevice,
    ExcludedApp,
    ExcludableAppCandidate,
    ExcludeAppResult,
    ModelCatalog,
    ModelOption,
  } from "$lib/types";
  import {
    addExcludedApp,
    addExcludableAppCandidate,
    clearAllHistory,
    clearHistory,
    getAppSettings,
    getExcludedApps,
    getExcludableAppCandidate,
    getHistoryCounts,
    getModelCatalog,
    pickAppToExclude,
    removeExcludedApp,
    updateAppSettings,
    rebindVoiceShortcut,
    rebindPaletteShortcut,
    getQuickMenuShortcut,
    setQuickMenuShortcut,
    getPaletteShortcut,
    setPaletteShortcut,
    listMicrophones,
    checkAccessibility,
    checkMicrophone,
    openAccessibilitySettings,
    openMicrophoneSettings,
    checkOllamaStatus,
    unloadOllamaModel,
    startOllamaServer,
    pullOllamaModel,
    testOllamaTagging,
    hubTestConnection,
    hubListModels,
    resetOverlayBoardSizes,
    type OllamaStatus,
  } from "$lib/api";
  import ActionMenu from "$lib/components/ActionMenu.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import SectionIcon, { type SectionIconName } from "$lib/components/SectionIcon.svelte";
  import FieldStatusFooter from "$lib/components/FieldStatusFooter.svelte";
  import HotkeySettingsSection from "$lib/components/HotkeySettingsSection.svelte";
  import SnippetsEditor from "$lib/components/SnippetsEditor.svelte";
  import { confirmDestructive } from "$lib/confirm";
  import {
    coerceSettingsPane,
    isSettingsPane,
    parseSettingsPaneFromQuery,
    type SettingsPane,
  } from "$lib/settings-pane";
  import {
    clearAllConfirmBody,
    clearUnpinnedConfirmBody,
    type ClearHistoryAction,
  } from "$lib/destructive-actions";
  import {
    allowInClipboardHistoryAriaLabel,
    allowedInHistoryNotice,
    alreadyExcludedFromHistoryNotice,
    alreadyExcludedListMetaLabel,
    appNotFoundNotice,
    chooseApplicationActionLabel,
    couldNotAddExcludedAppNotice,
    couldNotAddSelectedAppNotice,
    excludeFromClipboardHistoryAriaLabel,
    excludeListAddLabel,
    excludeListRemoveLabel,
    excludableCandidateMetaLabel,
    excludedFromHistoryNotice,
    invokeErrorMessage,
    isAppNotFoundError,
  } from "$lib/exclusion-label";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { initPlatform, platformIsMacOS } from "$lib/platform.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { checkForUpdate, currentVersion, type Update } from "$lib/updater";
  import { appendUpdateLog, readUpdateLog, clearUpdateLog, errorToString } from "$lib/update-log";

  let settings = $state<AppSettings>({
    ollama_model: "qwen3:4b-instruct-2507-q4_K_M",
    retention_days: 30,
    whisper_server_url: "",
    whisper_server_token: "",
    whisper_server_model: "whisper-1",
    voice_shortcut: "option+space",
    selected_microphone: "",
    hub_enabled: false,
    hub_url: "",
    hub_token: "",
    hub_chat_model: "",
    hub_tagging_enabled: false,
    hub_transcribe_enabled: false,
    voice_polish_enabled: false,
    voice_polish_model: "",
    voice_polish_screenshot: true,
    voice_polish_prompt: "",
    voice_translate_lang: "",
    voice_dictionary: "",
    voice_selected_text: false,
    board_vertical: false,
    voice_transcription_enabled: false,
    ai_tagging_enabled: false,
    overlay_shortcut_hints_enabled: true,
  });
  let microphones: AudioInputDevice[] = $state([]);
  let modelCatalog = $state<ModelCatalog>({
    total_memory_gb: 0,
    recommended_memory_gb: 0,
    options: [],
  });
  let selectedModelPreset = $state("__custom__");
  let excludedApps: ExcludedApp[] = $state([]);
  let excludedAppInput = $state("");
  let excludableCandidate: ExcludableAppCandidate | null = $state(null);
  let excludedAppsNotice = $state("");
  let excludedAppsNoticeTone = $state<"neutral" | "warn">("neutral");
  let excludeActionBusy = $state(false);
  let clearHistoryNotice = $state("");
  let historyCounts = $state({ total: 0, unpinned: 0, pinned: 0 });
  let clearHistoryActionInFlight = false;
  let savingSettings = $state(false);
  let settingsNotice = $state("");
  let savedModel = $state("");

  const A11Y_NOTICE_ENABLE = $derived($t("settings.msg.enable-copyosity-in-the"));
  const A11Y_NOTICE_VERIFIED = $derived($t("settings.msg.accessibility-verified-paste-automation"));

  let accessibilityGranted = $state<boolean | null>(null);
  let microphoneGranted = $state<boolean | null>(null);
  /** Отдельное состояние для «не удалось определить»: без него строка навсегда «Проверка...». */
  let microphoneUnreadable = $state(false);
  let micEnablePending = $state(false);
  // check_accessibility — синхронная команда: без флага соседние тики могут наложиться
  // и более старый ответ перезапишет более новый.
  let a11yPollBusy = false;
  const MIC_STATUS_TIMEOUT_MS = 4000;
  let accessibilityNotice = $state("");
  /** User was sent to System Settings; keep enable hint until access is granted. */
  let a11yEnablePending = $state(false);

  let ollamaStatus = $state<OllamaStatus | null>(null);
  let ollamaLoading = $state(false);
  let pullProgress = $state("");
  let taggingResult = $state<string[] | null | undefined>(undefined);
  let taggingLoading = $state(false);

  let hubTesting = $state(false);
  let hubTestResult = $state<{ ok: boolean; message: string } | null>(null);

  async function handleHubTest() {
    hubTesting = true;
    hubTestResult = null;
    try {
      const count = await hubTestConnection(settings.hub_url, settings.hub_token);
      hubTestResult = { ok: true, message: tr("settings.msg.connected-models-available", { count }) };
      loadHubModels();
    } catch (e) {
      hubTestResult = { ok: false, message: String(e) };
    } finally {
      hubTesting = false;
    }
  }

  const translateLangs = [
    { code: "en", label: "English" },
    { code: "ru", label: "Русский" },
    { code: "zh", label: "中文" },
    { code: "ja", label: "日本語" },
    { code: "ko", label: "한국어" },
    { code: "fr", label: "Français" },
    { code: "de", label: "Deutsch" },
    { code: "es", label: "Español" },
    { code: "pt", label: "Português" },
    { code: "it", label: "Italiano" },
    { code: "tr", label: "Türkçe" },
    { code: "uk", label: "Українська" },
  ];

  const retentionOptions = [
    { value: 1, labelKey: "settings.text.retention-1-day" },
    { value: 7, labelKey: "settings.text.retention-1-week" },
    { value: 30, labelKey: "settings.text.retention-1-month" },
    { value: 180, labelKey: "settings.text.retention-6-months" },
  ];

  /** Text fields and selects — saved via the footer bar. Booleans apply immediately. */
  const DEFERRED_SETTING_KEYS = [
    "ollama_model",
    "retention_days",
    "whisper_server_url",
    "whisper_server_token",
    "whisper_server_model",
    "selected_microphone",
    "hub_url",
    "hub_token",
    "hub_chat_model",
    "voice_polish_model",
    "voice_polish_prompt",
    "voice_translate_lang",
    "voice_dictionary",
  ] as const satisfies readonly (keyof AppSettings)[];

  type DeferredSettingKey = (typeof DEFERRED_SETTING_KEYS)[number];

  function pickDeferred(s: AppSettings): Pick<AppSettings, DeferredSettingKey> {
    return Object.fromEntries(
      DEFERRED_SETTING_KEYS.map((key) => [key, s[key]]),
    ) as Pick<AppSettings, DeferredSettingKey>;
  }

  async function loadSettings() {
    settings = await getAppSettings();
    selectedModelPreset = settings.ollama_model;
    savedModel = settings.ollama_model;
    snapshotDeferred();
  }

  async function loadModelCatalog() {
    modelCatalog = await getModelCatalog();
    if (!modelCatalog.options.some((o) => o.value === settings.ollama_model)) {
      selectedModelPreset = "__custom__";
    }
  }

  async function loadExcludedApps() {
    excludedApps = await getExcludedApps();
  }

  async function loadExcludableCandidate() {
    excludableCandidate = await getExcludableAppCandidate();
  }

  function isActiveApp(bundleId: string): boolean {
    return excludableCandidate?.bundleId === bundleId;
  }

  const listedExcludedApps = $derived(
    excludedApps.filter((app) => !isActiveApp(app.bundleId)),
  );

  const activeExcludedEntry = $derived.by(() => {
    const candidate = excludableCandidate;
    if (!candidate?.alreadyExcluded) return undefined;
    return excludedApps.find((app) => app.bundleId === candidate.bundleId);
  });

  const excludedAppsPanelHasRows = $derived(
    !!excludableCandidate || listedExcludedApps.length > 0,
  );

  function setExcludedAppsNotice(message: string, tone: "neutral" | "warn" = "neutral") {
    excludedAppsNotice = message;
    excludedAppsNoticeTone = tone;
  }

  function showExcludeAppNotice(result: ExcludeAppResult) {
    if (result.alreadyExcluded) {
      setExcludedAppsNotice(alreadyExcludedFromHistoryNotice(result.displayName), "warn");
      return;
    }
    setExcludedAppsNotice(excludedFromHistoryNotice(result.displayName));
  }

  async function refreshExcludedAppsSection() {
    await Promise.all([loadExcludedApps(), loadExcludableCandidate()]);
  }

  async function loadHistoryCounts() {
    historyCounts = await getHistoryCounts();
  }

  async function refreshHistoryCounts() {
    const previous = historyCounts;
    const skipNoticeReset = clearHistoryActionInFlight;
    await loadHistoryCounts();
    if (skipNoticeReset || clearHistoryActionInFlight) return;
    if (
      historyCounts.total !== previous.total ||
      historyCounts.unpinned !== previous.unpinned ||
      historyCounts.pinned !== previous.pinned
    ) {
      clearHistoryNotice = "";
    }
  }

  async function finishClearHistoryAction(notice: string) {
    await loadHistoryCounts();
    clearHistoryNotice = notice;
  }

  async function refreshOllamaStatus() {
    ollamaLoading = true;
    taggingResult = undefined;
    try {
      ollamaStatus = await checkOllamaStatus();
    } finally {
      ollamaLoading = false;
    }
  }

  async function handleStartServer() {
    ollamaLoading = true;
    try {
      await startOllamaServer();
      await refreshOllamaStatus();
    } finally {
      ollamaLoading = false;
    }
  }

  async function handlePullModel() {
    ollamaLoading = true;
    pullProgress = tr("settings.msg.starting-download");
    await pullOllamaModel();
    // Command returns immediately, progress comes via events
    // ollama-pull-done will reset the state
  }

  async function handleTestTagging() {
    taggingLoading = true;
    taggingResult = undefined;
    try {
      taggingResult = await testOllamaTagging();
    } finally {
      taggingLoading = false;
    }
  }

  function syncA11yNotice(granted: boolean, showVerified = false) {
    if (granted) {
      a11yEnablePending = false;
      if (showVerified || accessibilityNotice === A11Y_NOTICE_ENABLE) {
        accessibilityNotice = A11Y_NOTICE_VERIFIED;
      }
      return;
    }
    if (a11yEnablePending) {
      accessibilityNotice = A11Y_NOTICE_ENABLE;
    } else {
      accessibilityNotice = "";
    }
  }

  async function updateAccessibilityStatus() {
    const granted = await checkAccessibility(false);
    const wasPending = a11yEnablePending;
    accessibilityGranted = granted;
    syncA11yNotice(granted, wasPending);
    return granted;
  }

  async function handleRequestAccessibility() {
    // Только системное окно: открыть Системные настройки должен человек,
    // в этом окне кнопка «Открыть Системные настройки» и есть.
    await checkAccessibility(true);
    a11yEnablePending = true;
    accessibilityGranted = await checkAccessibility(false);
    syncA11yNotice(accessibilityGranted, true);
  }

  let microphonesLoading = $state(false);

  async function updateMicrophoneStatus() {
    try {
      microphoneGranted = await withTimeout(checkMicrophone(false), MIC_STATUS_TIMEOUT_MS);
      microphoneUnreadable = false;
    } catch {
      // Отказ или зависание — это ответ, а не «проверка»: без него строка остаётся в ожидании навсегда.
      microphoneUnreadable = true;
    }
    return microphoneGranted;
  }

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_resolve, reject) =>
        window.setTimeout(() => reject(new Error("timeout")), ms),
      ),
    ]);
  }

  async function handleRequestMicrophone() {
    try {
      await checkMicrophone(true);
    } catch {
      // Запрос не прошёл — состояние всё равно перечитываем, чтобы строка не зависла.
    }
    micEnablePending = true;
    await updateMicrophoneStatus();
  }

  async function handleRecheckMicrophone() {
    micEnablePending = false;
    await updateMicrophoneStatus();
  }

  async function handleLoadMicrophones() {
    if (microphonesLoading) {
      return;
    }
    microphonesLoading = true;
    try {
      microphones = await listMicrophones();
    } catch {
      microphones = [];
    } finally {
      microphonesLoading = false;
    }
  }

  async function handleRecheckAccessibility() {
    const granted = await checkAccessibility(false);
    accessibilityGranted = granted;
    syncA11yNotice(granted, a11yEnablePending);
  }

  onMount(() => {
    void initPlatform().then(() => {
      if (!platformIsMacOS() && activePane === "permissions") {
        activePane = "hub";
      }
      if (platformIsMacOS()) {
        void refreshExcludedAppsSection();
      }
      return undefined;
    });
    void loadSettings().then(() => {
      if (settings.hub_token?.trim()) {
        void handleHubTest();
        void loadHubModels();
      }
      return undefined;
    });
    loadModelCatalog();
    void loadHistoryCounts();
    void loadQuickMenuShortcut();
    void loadPaletteShortcut();
    void loadLaunchAtLogin();
    refreshOllamaStatus();
    void currentVersion().then((v) => {
      appVersion = v;
      return undefined;
    });
    refreshUpdateLog();
    void checkUpdates();

    const win = getCurrentWindow();
    // Status only: a check must not reach for the system prompt, let alone open System
    // Settings on the user. The Permissions pane's "Request" button is the only door.
    void updateAccessibilityStatus();
    void updateMicrophoneStatus();

    const unlistenPull = listen<string>("ollama-pull-progress", (event) => {
      pullProgress = event.payload;
    });

    const unlistenPullDone = listen<boolean>("ollama-pull-done", async () => {
      ollamaLoading = false;
      pullProgress = "";
      await refreshOllamaStatus();
    });

    const unlistenShown = listen("settings-shown", () => {
      void updateAccessibilityStatus();
      void updateMicrophoneStatus();
      void refreshExcludedAppsSection();
      void refreshHistoryCounts();
    });

    const onHistoryCountsEvent = () => void refreshHistoryCounts();
    const unlistenClipboard = listen("clipboard-changed", onHistoryCountsEvent);
    const unlistenHistory = listen("history-changed", onHistoryCountsEvent);

    const unlistenNavigatePane = listen<string>("navigate-settings-pane", (event) => {
      applySettingsPane(event.payload);
    });

    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void updateAccessibilityStatus();
        void updateMicrophoneStatus();
        void refreshExcludedAppsSection();
        void refreshHistoryCounts();
      }
    });

    // Разрешение выдаётся в Системных настройках: после переключения тумблера окно
    // может не получить фокус снова, и панель остаётся со статусом, прочитанным при монтировании.
    const a11yPoll = window.setInterval(() => {
      if (
        a11yPollBusy
        || activePane !== "permissions"
        || accessibilityGranted === null
        || !platformIsMacOS()
      ) {
        return;
      }
      a11yPollBusy = true;
      void checkAccessibility(false)
        .then((granted) => {
          if (granted !== accessibilityGranted) {
            accessibilityGranted = granted;
            syncA11yNotice(granted, a11yEnablePending);
          }
          return undefined;
        })
        .catch(() => undefined)
        .finally(() => {
          a11yPollBusy = false;
        });
    }, 2000);

    return () => {
      window.clearInterval(a11yPoll);
      unlistenPull.then((fn) => fn());
      unlistenPullDone.then((fn) => fn());
      unlistenShown.then((fn) => fn());
      unlistenClipboard.then((fn) => fn());
      unlistenHistory.then((fn) => fn());
      unlistenNavigatePane.then((fn) => fn());
      unlistenFocus.then((fn) => fn());
    };
  });

  async function saveSettings() {
    savingSettings = true;
    settingsNotice = "";
    try {
      const deferred = pickDeferred(settings);
      settings = await updateAppSettings(deferred);
      savedModel = settings.ollama_model;
      snapshotDeferred();
      settingsNotice = tr("settings.msg.saved");
      taggingResult = undefined;
      await Promise.all([
        rebindVoiceShortcut(),
        rebindPaletteShortcut(),
        loadModelCatalog(),
        refreshOllamaStatus(),
        emit("hub-settings-changed"),
      ]);
    } finally {
      savingSettings = false;
    }
  }

  function handleModelPresetChange(value: string) {
    selectedModelPreset = value;
    if (value !== "__custom__") {
      settings.ollama_model = value;
    }
  }

  async function handleAddExcludedByName() {
    const value = excludedAppInput.trim();
    if (!value) return;
    setExcludedAppsNotice("");
    try {
      const result = await addExcludedApp(value);
      if (!result.alreadyExcluded) {
        excludedAppInput = "";
      }
      showExcludeAppNotice(result);
      await refreshExcludedAppsSection();
    } catch (err) {
      if (isAppNotFoundError(err)) {
        setExcludedAppsNotice(appNotFoundNotice(value), "warn");
        return;
      }
      setExcludedAppsNotice(couldNotAddExcludedAppNotice(value), "warn");
    }
  }

  async function handleAddCandidateApp() {
    if (excludeActionBusy) return;
    excludeActionBusy = true;
    setExcludedAppsNotice("");
    try {
      const result = await addExcludableAppCandidate();
      if (result) {
        showExcludeAppNotice(result);
      } else {
        setExcludedAppsNotice(
          tr("settings.msg.no-active-app-detected"),
          "warn",
        );
      }
      await refreshExcludedAppsSection();
    } catch (err) {
      const fallback = excludableCandidate
        ? couldNotAddExcludedAppNotice(excludableCandidate.displayName)
        : couldNotAddSelectedAppNotice();
      setExcludedAppsNotice(invokeErrorMessage(err) || fallback, "warn");
    } finally {
      excludeActionBusy = false;
    }
  }

  async function handleChooseApp() {
    if (excludeActionBusy) return;
    excludeActionBusy = true;
    setExcludedAppsNotice("");
    try {
      const result = await pickAppToExclude();
      if (result) {
        showExcludeAppNotice(result);
        await refreshExcludedAppsSection();
      }
    } catch (err) {
      const message = invokeErrorMessage(err);
      if (message.startsWith("main_thread_required:")) {
        setExcludedAppsNotice(tr("settings.msg.could-not-open-the"), "warn");
      } else {
        setExcludedAppsNotice(message || couldNotAddSelectedAppNotice(), "warn");
      }
    } finally {
      excludeActionBusy = false;
    }
  }

  async function handleRemoveExcludedApp(id: number, displayName: string) {
    if (excludeActionBusy) return;
    excludeActionBusy = true;
    try {
      await removeExcludedApp(id);
      setExcludedAppsNotice(allowedInHistoryNotice(displayName));
      await refreshExcludedAppsSection();
    } catch (err) {
      setExcludedAppsNotice(
        invokeErrorMessage(err) || tr("settings.msg.could-not-update-excluded"),
        "warn",
      );
    } finally {
      excludeActionBusy = false;
    }
  }

  async function handleClearHistoryMenu(action: ClearHistoryAction) {
    clearHistoryNotice = "";
    await loadHistoryCounts();

    switch (action) {
      case "unpinned": {
        if (historyCounts.unpinned === 0) {
          clearHistoryNotice = tr("settings.msg.no-unpinned-history-to");
          return;
        }
        const confirmed = await confirmDestructive({
          title: tr("settings.msg.clear-unpinned-history"),
          messageBody: clearUnpinnedConfirmBody(historyCounts),
          confirmLabel: tr("settings.msg.clear-unpinned"),
        });
        if (!confirmed) return;
        clearHistoryActionInFlight = true;
        try {
          await clearHistory();
          await finishClearHistoryAction(tr("settings.msg.unpinned-history-cleared"));
        } catch (err) {
          await finishClearHistoryAction(
            invokeErrorMessage(err) || tr("settings.msg.could-not-clear-history"),
          );
        } finally {
          clearHistoryActionInFlight = false;
        }
        break;
      }
      case "all": {
        if (historyCounts.total === 0) {
          clearHistoryNotice = tr("settings.msg.history-is-already-empty");
          return;
        }
        const confirmed = await confirmDestructive({
          title: tr("settings.msg.clear-all-history"),
          messageBody: clearAllConfirmBody(historyCounts),
          confirmLabel: tr("settings.msg.clear-all"),
        });
        if (!confirmed) return;
        clearHistoryActionInFlight = true;
        try {
          await clearAllHistory();
          await finishClearHistoryAction(tr("settings.msg.all-history-cleared"));
        } catch (err) {
          await finishClearHistoryAction(
            invokeErrorMessage(err) || tr("settings.msg.could-not-clear-history"),
          );
        } finally {
          clearHistoryActionInFlight = false;
        }
        break;
      }
      default: {
        const exhaustive: never = action;
        void exhaustive;
        return;
      }
    }
  }

  const clearHistoryMenuDisabled = $derived(historyCounts.total === 0);

  const clearHistoryMenuItems = $derived([
    {
      id: "unpinned",
      label: $t("settings.msg.clear-unpinned-history"),
      disabled: historyCounts.unpinned === 0,
    },
    {
      id: "all",
      label: $t("settings.msg.clear-all-history"),
      disabled: historyCounts.total === 0,
      destructive: true,
    },
  ]);

  let selectedModelMeta = $derived.by<ModelOption | null>(() => {
    return modelCatalog.options.find((o) => o.value === settings.ollama_model) ?? null;
  });

  let modelDirty = $derived(settings.ollama_model !== savedModel);

  type ImmediateSettingPatch = Partial<
    Pick<
      AppSettings,
      | "hub_enabled"
      | "hub_tagging_enabled"
      | "hub_transcribe_enabled"
      | "voice_polish_enabled"
      | "voice_polish_screenshot"
      | "voice_selected_text"
      | "voice_transcription_enabled"
      | "ai_tagging_enabled"
      | "overlay_shortcut_hints_enabled"
      | "board_vertical"
    >
  >;

  async function persistImmediate(
    patch: ImmediateSettingPatch,
    afterSave?: () => void | Promise<void>,
  ) {
    settingsNotice = "";
    const previous = settings;
    settings = { ...settings, ...patch };
    const deferredDraft = pickDeferred(settings);
    try {
      const saved = await updateAppSettings(patch);
      settings = { ...saved, ...deferredDraft };
      settingsNotice = "";
      await afterSave?.();
    } catch (e) {
      settings = previous;
      settingsNotice = String(e);
    }
  }

  function handleHubToggle(enabled: boolean) {
    void persistImmediate({ hub_enabled: enabled }, () => emit("hub-settings-changed"));
  }

  function handleVoiceToggle(enabled: boolean) {
    void persistImmediate({ voice_transcription_enabled: enabled }, async () => {
      await rebindVoiceShortcut();
    });
  }

  function handleAiTaggingToggle(enabled: boolean) {
    void persistImmediate({ ai_tagging_enabled: enabled }, async () => {
      if (enabled) {
        taggingResult = undefined;
        await refreshOllamaStatus();
      }
    });
  }

  function handleOverlayShortcutHintsToggle(enabled: boolean) {
    void persistImmediate({ overlay_shortcut_hints_enabled: enabled });
  }

  function handleBoardVerticalToggle(enabled: boolean) {
    void persistImmediate({ board_vertical: enabled });
  }

  async function handleRestoreOverlayBoardSizes() {
    try {
      await resetOverlayBoardSizes();
      settingsNotice = tr("settings.msg.panel-size-restored-to");
    } catch (e) {
      settingsNotice = String(e);
    }
  }

  function handleHubTaggingToggle(enabled: boolean) {
    void persistImmediate({ hub_tagging_enabled: enabled }, () => emit("hub-settings-changed"));
  }

  function handleHubTranscribeToggle(enabled: boolean) {
    void persistImmediate({ hub_transcribe_enabled: enabled }, () => emit("hub-settings-changed"));
  }

  function handleVoicePolishToggle(enabled: boolean) {
    void persistImmediate({ voice_polish_enabled: enabled });
  }

  function handleVoicePolishScreenshotToggle(enabled: boolean) {
    void persistImmediate({ voice_polish_screenshot: enabled });
  }

  function handleVoiceSelectedTextToggle(enabled: boolean) {
    void persistImmediate({ voice_selected_text: enabled });
  }

  // ---- Sidebar navigation ----
  function paneFromUrl(): SettingsPane | null {
    if (typeof window === "undefined") return null;
    return parseSettingsPaneFromQuery(window.location.search);
  }

  function applySettingsPane(pane: string | null | undefined) {
    if (!pane || !isSettingsPane(pane)) return;
    activePane = pane;
  }

  let activePane = $state<SettingsPane>(coerceSettingsPane(paneFromUrl()));
  const panes: { id: SettingsPane; labelKey: string; icon: SectionIconName }[] = [
    { id: "hub", labelKey: "nav.hub", icon: "hub" },
    { id: "voice", labelKey: "nav.voice", icon: "voice" },
    { id: "quickmenu", labelKey: "nav.quickmenu", icon: "clipboard-panel" },
    { id: "ai", labelKey: "nav.ai", icon: "ai-tagging" },
    { id: "history", labelKey: "nav.history", icon: "clipboard-panel" },
    { id: "permissions", labelKey: "nav.permissions", icon: "permissions" },
    { id: "updates", labelKey: "nav.updates", icon: "updates" },
    { id: "general", labelKey: "nav.general", icon: "general" },
  ];

  // ---- Quick menu (Clipy-style native menu) ----
  let quickMenuShortcut = $state("cmd+shift+c");
  let quickMenuNotice = $state("");
  let quickMenuNoticeTone = $state<"ok" | "fail">("ok");
  async function loadQuickMenuShortcut() {
    try {
      quickMenuShortcut = await getQuickMenuShortcut();
    } catch {
      // keep default
    }
  }
  async function saveQuickMenuShortcut() {
    quickMenuNotice = "";
    try {
      quickMenuShortcut = await setQuickMenuShortcut(quickMenuShortcut);
      quickMenuNotice = tr("settings.msg.saved");
      quickMenuNoticeTone = "ok";
    } catch (e) {
      quickMenuNotice = `${e}`;
      quickMenuNoticeTone = "fail";
    }
  }

  // ---- Command / agent palette hotkey ----
  let paletteShortcut = $state("cmd+shift+space");
  let paletteNotice = $state("");
  let paletteNoticeTone = $state<"ok" | "fail">("ok");
  async function loadPaletteShortcut() {
    try {
      paletteShortcut = await getPaletteShortcut();
    } catch {
      // keep default
    }
  }
  async function savePaletteShortcut() {
    paletteNotice = "";
    try {
      paletteShortcut = await setPaletteShortcut(paletteShortcut);
      paletteNotice = tr("settings.msg.saved");
      paletteNoticeTone = "ok";
    } catch (e) {
      paletteNotice = `${e}`;
      paletteNoticeTone = "fail";
    }
  }

  // ---- Launch at login (macOS LaunchAgent via tauri-plugin-autostart) ----
  let launchAtLogin = $state(false);
  let launchAtLoginBusy = $state(false);
  async function loadLaunchAtLogin() {
    try {
      launchAtLogin = await isAutostartEnabled();
    } catch {
      // plugin unavailable — leave as false
    }
  }
  async function toggleLaunchAtLogin(next: boolean) {
    launchAtLoginBusy = true;
    try {
      if (next) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      launchAtLogin = await isAutostartEnabled();
    } catch {
      // revert the visual state to the real one on failure
      try {
        launchAtLogin = await isAutostartEnabled();
      } catch {
        launchAtLogin = !next;
      }
    } finally {
      launchAtLoginBusy = false;
    }
  }

  let voiceShortcutNotice = $state("");
  let voiceShortcutNoticeTone = $state<"ok" | "fail">("ok");
  async function saveVoiceShortcut() {
    voiceShortcutNotice = "";
    try {
      const deferred = pickDeferred(settings);
      const saved = await updateAppSettings({ voice_shortcut: settings.voice_shortcut });
      settings = { ...saved, ...deferred };
      await rebindVoiceShortcut();
      snapshotDeferred();
      voiceShortcutNotice = tr("settings.msg.saved");
      voiceShortcutNoticeTone = "ok";
    } catch (e) {
      voiceShortcutNotice = `${e}`;
      voiceShortcutNoticeTone = "fail";
    }
  }

  // ---- Auto-updates ----
  let appVersion = $state("");
  let updateChecking = $state(false);
  let update = $state<Update | null>(null);
  let updateMessage = $state("");
  let updateInstalling = $state(false);
  let updateProgress = $state(0); // 0..100, -1 = indeterminate
  let updateLog = $state<string[]>([]);
  let updateLogCopied = $state(false);

  function refreshUpdateLog() {
    updateLog = readUpdateLog();
  }

  async function checkUpdates() {
    updateChecking = true;
    updateMessage = "";
    update = null;
    appendUpdateLog(`check: looking for updates (current ${appVersion || "?"})…`);
    try {
      const u = await checkForUpdate();
      if (u) {
        update = u;
        updateMessage = tr("updates.available", { version: u.version });
        appendUpdateLog(`check: update ${u.version} available`);
      } else {
        updateMessage = tr("settings.msg.you-re-on-the");
        appendUpdateLog("check: already up to date");
      }
    } catch (e) {
      updateMessage = tr("settings.msg.check-failed", { error: errorToString(e) });
      appendUpdateLog(`check: ERROR — ${errorToString(e)}`);
    } finally {
      updateChecking = false;
      refreshUpdateLog();
    }
  }

  async function installUpdate() {
    if (!update) return;
    updateInstalling = true;
    updateProgress = -1;
    updateMessage = tr("settings.msg.installing");
    appendUpdateLog(`install: downloading + installing ${update.version} (same-volume temp)…`);
    refreshUpdateLog();
    // Progress is emitted from the Rust install command.
    const unlisten = await listen<number | null>("update-progress", (e) => {
      updateProgress = typeof e.payload === "number" ? e.payload : -1;
    });
    try {
      // Runs the whole install in Rust: temp dirs on the app's own volume
      // (avoids EXDEV), then relaunch. On success the process restarts and this
      // never returns; any thrown value is the real, actionable error.
      await invoke("install_update");
      appendUpdateLog("install: bundle replaced OK — relaunching…");
    } catch (e) {
      updateMessage = tr("settings.msg.install-failed", { error: errorToString(e) });
      appendUpdateLog(`install: ERROR — ${errorToString(e)}`);
      updateInstalling = false;
    } finally {
      unlisten();
      refreshUpdateLog();
    }
  }

  async function copyUpdateLog() {
    try {
      await navigator.clipboard.writeText(updateLog.join("\n"));
      updateLogCopied = true;
      setTimeout(() => (updateLogCopied = false), 1500);
    } catch {
      // ignore
    }
  }

  function clearUpdateLogAndRefresh() {
    clearUpdateLog();
    refreshUpdateLog();
  }
  const visiblePanes = $derived(
    platformIsMacOS() ? panes : panes.filter((p) => p.id !== "permissions"),
  );

  $effect(() => {
    if (activePane === "permissions" && platformIsMacOS()) {
      void updateAccessibilityStatus();
    }
  });

  // ---- Hub model list (from /models) ----
  let hubModels = $state<string[]>([]);
  let modelsLoading = $state(false);
  async function loadHubModels() {
    if (!settings.hub_token?.trim()) return;
    modelsLoading = true;
    try {
      hubModels = await hubListModels(settings.hub_url, settings.hub_token);
    } catch {
      // leave hubModels as-is; the field still allows manual entry
    } finally {
      modelsLoading = false;
    }
  }
  /** Ensure the currently-selected value is always present in the dropdown. */
  function withCurrent(list: string[], current: string): string[] {
    return current && !list.includes(current) ? [current, ...list] : list;
  }

  // ---- Dirty tracking (unsaved deferred fields only) ----
  let savedDeferredSnapshot = $state("");
  let isDirty = $derived(
    savedDeferredSnapshot !== "" &&
      JSON.stringify(pickDeferred(settings)) !== savedDeferredSnapshot,
  );
  function snapshotDeferred() {
    savedDeferredSnapshot = JSON.stringify(pickDeferred(settings));
  }

  function clearTransientPaneNotices() {
    settingsNotice = "";
    quickMenuNotice = "";
    paletteNotice = "";
    voiceShortcutNotice = "";
    excludedAppsNotice = "";
    clearHistoryNotice = "";
    accessibilityNotice = "";
  }

  // Transient feedback — dismiss when switching sidebar panes or editing deferred fields.
  $effect(() => {
    void activePane;
    clearTransientPaneNotices();
  });
  $effect(() => {
    if (isDirty) settingsNotice = "";
  });

  async function resetSettings() {
    await loadSettings();
    settingsNotice = "";
  }
</script>

{#snippet busySpinner()}
  <span class="app-btn-spinner" aria-hidden="true">
    <span class="app-btn-spinner-icon"></span>
  </span>
{/snippet}

<div class="settings-shell ui-no-select">
  <aside class="settings-sidebar">
    <div class="sidebar-title">{$t("settings.title")}</div>
    <nav class="sidebar-nav">
      {#each visiblePanes as p}
        <button
          class="nav-item"
          class:active={activePane === p.id}
          type="button"
          onclick={() => (activePane = p.id)}
        >
          <SectionIcon name={p.icon} class="nav-section-icon" />
          <span>{$t(p.labelKey)}</span>
        </button>
      {/each}
    </nav>
    <div class="sidebar-foot">
      <span class="sidebar-dot" class:ok={hubTestResult?.ok} class:fail={hubTestResult && !hubTestResult.ok}></span>
      <span>{hubTestResult ? (hubTestResult.ok ? $t("settings.msg.hub-connected") : $t("settings.msg.hub-error")) : settings.hub_token?.trim() ? $t("settings.msg.hub-configured") : $t("settings.msg.hub-not-set")}</span>
    </div>
  </aside>

  <main class="settings-content">
    {#if activePane === "hub"}
      <div class="pane-head">
        <div class="pane-title">{$t("nav.hub")}</div>
        <div class="pane-subtitle">{$t("settings.text.cloud-models-for-tagging")}</div>
      </div>

      <section class="form-section">
        <div class="form-section-header">
          <div class="form-section-title form-section-title--with-icon"><SectionIcon name="hub" />{$t("settings.text.hub")}</div>
          <label class="toggle">
            <input
              type="checkbox"
              role="switch"
              aria-label={$t("settings.aria-label.enable-the-ai-hub")}
              checked={settings.hub_enabled}
              onchange={(e) => handleHubToggle((e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="toggle-slider" aria-hidden="true"></span>
          </label>
        </div>
        <fieldset
          class="form-section-body form-section-body--subsections toggle-section-body"
          class:is-disabled={!settings.hub_enabled}
          disabled={!settings.hub_enabled}
        >
          <div class="form-hint">
            {$t("settings.text.when-off-hub-tagging")}
          </div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon"><SectionIcon name="connection" />{$t("settings.text.connection")}</div>
            <div class="inset-list">
              <div class="form-field">
                <span class="form-label">{$t("settings.text.steps-3")}</span>
                <ol class="form-instruction-list">
                  <li>{$t("settings.text.get-an-api-key")}</li>
                  <li>
                    {$t("settings.text.paste-into-field.a")}<strong>{$t("settings.text.api-token")}</strong>{$t("settings.text.paste-into-field.b")}
                  </li>
                  <li>
                    {$t("settings.text.click-test-then-save.a")}<strong>{$t("settings.text.test-connection")}</strong>{$t("settings.text.click-test-then-save.b")}<strong>{$t("common.save")}</strong>
                  </li>
                </ol>
              </div>

              <label class="form-field">
                <span class="form-label">{$t("settings.text.api-base-url")}</span>
                <input
                  class="form-input"
                  type="text"
                  bind:value={settings.hub_url}
                  placeholder="http://localhost:8000/v1"
                />
                <div class="form-hint">
                  {$t("settings.text.api-base-url-hint.1")}<code>/v1</code>{$t("settings.text.api-base-url-hint.2")}<code>/v1</code>{$t("settings.text.api-base-url-hint.3")}<code>http://</code>{$t("settings.text.api-base-url-hint.4")}
                </div>
              </label>
              <label class="form-field">
                <span class="form-label">{$t("settings.text.api-token")}</span>
                <input
                  class="form-input"
                  type="password"
                  bind:value={settings.hub_token}
                  placeholder={$t("settings.placeholder.provider-key-bearer")}
                />
                <button class="form-btn form-btn-secondary app-btn" type="button" disabled={hubTesting} onclick={handleHubTest}>
                  {hubTesting ? $t("settings.msg.testing") : $t("settings.msg.test-connection")}
                </button>
                {#if hubTestResult}
                  <div class="form-hint" class:ok={hubTestResult.ok} class:fail={!hubTestResult.ok}>
                    {hubTestResult.message}
                  </div>
                {/if}
              </label>
            </div>
          </div>

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon"><SectionIcon name="ollama-model" />{$t("settings.text.model")}</div>
            <div class="inset-list">
              <label class="form-field">
                <span class="form-label">{$t("settings.text.chat-agent-model-tagging")}</span>
                <div class="form-inline">
                  <select class="form-select" bind:value={settings.hub_chat_model}>
                    {#each withCurrent(hubModels, settings.hub_chat_model) as m}
                      <option value={m}>{m}</option>
                    {/each}
                  </select>
                  <button class="form-btn form-btn-secondary app-btn" type="button" disabled={modelsLoading} onclick={loadHubModels} title={$t("settings.title.load-live-model-list")}>
                    {modelsLoading ? "…" : "↻"}
                  </button>
                </div>
                <div class="form-hint">
                  {hubModels.length ? $t("settings.text.models-loaded-from-the", { count: hubModels.length }) : $t("settings.text.test-connection-or-press")}
                </div>
              </label>
            </div>
          </div>

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon"><SectionIcon name="setup" />{$t("settings.text.features")}</div>
            <div class="inset-list">
              <label class="form-checkbox">
                <span class="form-checkbox-leading">
                  <input
                    type="checkbox"
                    checked={settings.hub_tagging_enabled}
                    onchange={(e) =>
                      handleHubTaggingToggle((e.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class="form-checkbox-box" aria-hidden="true"></span>
                </span>
                <span class="form-checkbox-label ui-selectable-text">{$t("settings.text.use-hub-for-tagging")}</span>
              </label>
              <label class="form-checkbox">
                <span class="form-checkbox-leading">
                  <input
                    type="checkbox"
                    checked={settings.hub_transcribe_enabled}
                    onchange={(e) =>
                      handleHubTranscribeToggle((e.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class="form-checkbox-box" aria-hidden="true"></span>
                </span>
                <span class="form-checkbox-label ui-selectable-text">{$t("settings.text.use-hub-for-voice")}</span>
              </label>
            </div>
            <div class="form-hint">
              <strong>{$t("settings.text.web-search-label")}</strong> {$t("settings.text.web-search-hint.1")}<code>⌘⇧Space</code> {$t("settings.text.web-search-hint.2")} {$t("settings.text.agent-search")} {$t("settings.text.web-search-hint.3")}
            </div>
          </div>
        </fieldset>
      </section>

      <section class="form-section">
        <div class="form-section-body form-section-body--subsections">
          <HotkeySettingsSection
            bind:value={paletteShortcut}
            placeholder="cmd+shift+space"
            examples={["cmd+shift+space"]}
            detail={$t("settings.text.opens-the-command")}
            notice={paletteNotice || undefined}
            noticeTone={paletteNoticeTone}
            onSave={savePaletteShortcut}
          />
        </div>
      </section>
    {:else if activePane === "voice"}
      <div class="pane-head">
        <div class="pane-title">{$t("settings.text.voice")}</div>
        <div class="pane-subtitle">{$t("settings.text.hold-the-shortcut-to")}</div>
      </div>

      <section class="form-section">
        <div class="form-section-header">
          <div class="form-section-title form-section-title--with-icon"><SectionIcon name="recording" />{$t("settings.text.recording")}</div>
          <label class="toggle">
            <input
              type="checkbox"
              role="switch"
              aria-label={$t("settings.aria-label.enable-voice-transcription")}
              checked={settings.voice_transcription_enabled}
              onchange={(e) => handleVoiceToggle((e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="toggle-slider" aria-hidden="true"></span>
          </label>
        </div>
        <fieldset
          class="form-section-body form-section-body--subsections toggle-section-body"
          class:is-disabled={!settings.voice_transcription_enabled}
          disabled={!settings.voice_transcription_enabled}
        >
          <div class="form-hint">
            {$t("settings.text.when-off-the-global")}
          </div>

          <HotkeySettingsSection
            bind:value={settings.voice_shortcut}
            placeholder="option+space"
            examples={["option+space", "cmd+shift+r", "ctrl+alt+space"]}
            detail={$t("settings.text.hold-to-record-release")}
            notice={voiceShortcutNotice || undefined}
            noticeTone={voiceShortcutNoticeTone}
            onSave={saveVoiceShortcut}
          />

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon">
              <SectionIcon name="hub" class="form-subsection-icon" />{$t("settings.text.transcription")}
            </div>
            <div class="inset-list">
              <label class="form-checkbox">
                <span class="form-checkbox-leading">
                  <input
                    type="checkbox"
                    checked={settings.hub_transcribe_enabled}
                    disabled={!settings.hub_enabled}
                    onchange={(e) =>
                      handleHubTranscribeToggle((e.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class="form-checkbox-box" aria-hidden="true"></span>
                </span>
                <span class="form-checkbox-label ui-selectable-text">{$t("settings.text.transcribe-with-the-ai")}</span>
              </label>
            </div>
            <div class="form-hint">
              {#if settings.hub_enabled}
                {$t("settings.text.on-hub-off-your.1")}<code>/v1/audio/transcriptions</code>{$t("settings.text.on-hub-off-your.2")}
              {:else}
                {$t("settings.text.enable-the-ai-hub.1")}<strong>{$t("settings.text.ai-hub")}</strong>{$t("settings.text.enable-the-ai-hub.2")}
              {/if}
            </div>
          </div>

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon">
              <SectionIcon name="voice" class="form-subsection-icon" />{$t("settings.text.microphone")}
            </div>
            <div class="inset-list">
              <div class="form-field">
                <select
                  class="form-select"
                  aria-label={$t("settings.aria-label.microphone")}
                  bind:value={settings.selected_microphone}
                >
                  <option value="">{$t("settings.text.system-default")}</option>
                  {#if settings.selected_microphone && !microphones.some((m) => m.name === settings.selected_microphone)}
                    <option value={settings.selected_microphone}>{settings.selected_microphone}</option>
                  {/if}
                  {#each microphones as mic}
                    <option value={mic.name}>{mic.name}{mic.is_default ? $t("settings.text.default-suffix") : ""}</option>
                  {/each}
                </select>
                <button
                  class="status-action app-btn"
                  type="button"
                  onclick={handleLoadMicrophones}
                  disabled={microphonesLoading}
                >
                  {microphonesLoading ? $t("settings.text.checking") : $t("settings.text.refresh-m")}
                </button>
              </div>
              {#if microphones.length === 0 && !microphonesLoading}
                <div class="status-hint">
                  {$t("settings.text.mic-list-hint")}
                </div>
              {/if}
            </div>
          </div>

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon"><SectionIcon name="ollama-model" />{$t("settings.text.transcription-model")}</div>
            <div class="form-hint">
              {$t("settings.text.with-hub-transcription.1")}<strong>{$t("settings.text.hub-transcription")}</strong>{$t("settings.text.with-hub-transcription.2")}
            </div>
            <div class="inset-list">
              <label class="form-field">
                <span class="form-label">{$t("settings.text.model")}</span>
                <div class="form-inline">
                  <select class="form-select" bind:value={settings.whisper_server_model}>
                    {#each withCurrent(hubModels.length ? hubModels : ["whisper-1"], settings.whisper_server_model) as m}
                      <option value={m}>{m}</option>
                    {/each}
                  </select>
                  <button class="form-btn form-btn-secondary app-btn" type="button" disabled={modelsLoading} onclick={loadHubModels} title={$t("settings.title.load-live-model-list")}>
                    {modelsLoading ? "…" : "↻"}
                  </button>
                </div>
                <div class="form-hint">
                  {$t("settings.text.pick-transcription-model.1")}<code>whisper-1</code>{$t("settings.text.pick-transcription-model.2")}<code>подлодка</code>
                </div>
              </label>
              <label class="form-field">
                <span class="form-label">{$t("settings.text.custom-whisper-server-url")}</span>
                <input
                  class="form-input"
                  type="text"
                  bind:value={settings.whisper_server_url}
                  placeholder="http://localhost:8000/v1/audio/transcriptions"
                />
              </label>
              <label class="form-field">
                <span class="form-label">{$t("settings.text.custom-server-token-optional")}</span>
                <input
                  class="form-input"
                  type="password"
                  bind:value={settings.whisper_server_token}
                  placeholder={$t("settings.placeholder.bearer-token-optional")}
                />
              </label>
            </div>
          </div>

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon"><SectionIcon name="text-polish" />{$t("settings.text.ai-text-polishing")}</div>
            <div class="form-hint">
              {$t("settings.text.after-transcription-run")}
            </div>
            <div class="inset-list">
              <label class="form-checkbox">
                <span class="form-checkbox-leading">
                  <input
                    type="checkbox"
                    checked={settings.voice_polish_enabled}
                    disabled={!settings.hub_enabled}
                    onchange={(e) =>
                      handleVoicePolishToggle((e.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class="form-checkbox-box" aria-hidden="true"></span>
                </span>
                <span class="form-checkbox-label ui-selectable-text">{$t("settings.text.polish-transcription-with-the")}</span>
              </label>
              {#if settings.voice_polish_enabled && settings.hub_enabled}
                <label class="form-checkbox form-checkbox--indented">
                  <span class="form-checkbox-leading">
                    <input
                      type="checkbox"
                      checked={settings.voice_polish_screenshot}
                      onchange={(e) =>
                        handleVoicePolishScreenshotToggle((e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span class="form-checkbox-box" aria-hidden="true"></span>
                  </span>
                  <span class="form-checkbox-label ui-selectable-text">{$t("settings.text.send-a-screenshot-of")}</span>
                </label>
                <label class="form-checkbox form-checkbox--indented">
                  <span class="form-checkbox-leading">
                    <input
                      type="checkbox"
                      checked={settings.voice_selected_text}
                      onchange={(e) =>
                        handleVoiceSelectedTextToggle((e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span class="form-checkbox-box" aria-hidden="true"></span>
                  </span>
                  <span class="form-checkbox-label ui-selectable-text">{$t("settings.text.selected-text-mode-if")}</span>
                </label>

                <label class="form-field">
                  <span class="form-label">{$t("settings.text.polish-model-multimodal-for")}</span>
                  <div class="form-inline">
                    <select class="form-select" bind:value={settings.voice_polish_model}>
                      {#each withCurrent(hubModels, settings.voice_polish_model) as m}
                        <option value={m}>{m}</option>
                      {/each}
                    </select>
                    <button class="form-btn form-btn-secondary app-btn" type="button" disabled={modelsLoading} onclick={loadHubModels} title={$t("settings.title.load-live-model-list")}>
                      {modelsLoading ? "…" : "↻"}
                    </button>
                  </div>
                  <div class="form-hint">{$t("settings.text.use-a-multimodal-model")}</div>
                </label>

                <label class="form-field">
                  <span class="form-label">{$t("settings.text.translate-result-to")}</span>
                  <select class="form-select" bind:value={settings.voice_translate_lang}>
                    <option value="">{$t("settings.text.don-t-translate")}</option>
                    {#each translateLangs as l}
                      <option value={l.code}>{l.label}</option>
                    {/each}
                  </select>
                </label>

                <label class="form-field">
                  <span class="form-label">{$t("settings.text.custom-polishing-instructions-optional")}</span>
                  <textarea
                    class="form-textarea"
                    rows="3"
                    bind:value={settings.voice_polish_prompt}
                    placeholder={$t("settings.placeholder.e-g-always-sign")}
                  ></textarea>
                </label>

                <label class="form-field">
                  <span class="form-label">{$t("settings.text.dictionary-exact-spellings-one")}</span>
                  <textarea
                    class="form-textarea"
                    rows="3"
                    bind:value={settings.voice_dictionary}
                    placeholder={"bash\nssh\ndocker"}
                  ></textarea>
                  <div class="form-hint">{$t("settings.text.the-model-will-keep")}</div>
                </label>
              {/if}
            </div>
          </div>
        </fieldset>
      </section>
    {:else if activePane === "quickmenu"}
      <div class="pane-head">
        <div class="pane-title">{$t("nav.quickmenu")}</div>
        <div class="pane-subtitle">{$t("settings.text.a-native-pop-up")}</div>
      </div>

      <section class="form-section">
        <div class="form-section-body form-section-body--subsections">
          <HotkeySettingsSection
            bind:value={quickMenuShortcut}
            placeholder="cmd+shift+c"
            examples={["cmd+shift+c"]}
            detail={$t("settings.text.press-anywhere-to")}
            notice={quickMenuNotice || undefined}
            noticeTone={quickMenuNoticeTone}
            onSave={saveQuickMenuShortcut}
          />

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon">
              <SectionIcon name="snippets" class="form-subsection-icon" />{$t("settings.text.snippets")}
            </div>
            <div class="form-hint">
              {$t("settings.text.reusable-text-templates")}
            </div>
            <SnippetsEditor />
          </div>
        </div>
      </section>
    {:else if activePane === "permissions"}
      <div class="pane-head">
        <div class="pane-title">{$t("nav.permissions")}</div>
        <div class="pane-subtitle">{$t("settings.text.accessibility-access-is-required")}</div>
      </div>

      <section class="form-section">
        <div class="form-section-title form-section-title--with-icon"><SectionIcon name="permissions" />{$t("settings.text.accessibility")}</div>
        <div class="form-section-body">
          <div class="inset-list">
            <div class="status-step">
              <div class="status-row">
                <span class="status-dot" class:ok={accessibilityGranted === true} class:fail={accessibilityGranted === false} class:checking={accessibilityGranted === null}></span>
                <span class="status-text">
                  {accessibilityGranted === null ? $t("settings.text.checking") : accessibilityGranted ? $t("settings.msg.accessibility-granted") : $t("settings.msg.accessibility-not-granted")}
                </span>
                {#if accessibilityGranted === false}
                  <button class="status-action app-btn" type="button" onclick={handleRequestAccessibility}>
                    {$t("settings.text.request")}</button>
                {:else}
                  <button class="status-action app-btn" type="button" onclick={handleRecheckAccessibility}>
                    {$t("settings.text.recheck")}</button>
                {/if}
              </div>
              {#if accessibilityGranted === false}
                <div class="status-hint">
                  {$t("settings.text.required-for-paste")}<br />
                  {$t("settings.text.click-request.1")}{$t("settings.text.request")}{$t("settings.text.click-request.2")}<strong>Copyocity</strong>.
                </div>
                <div class="status-hint">
                  <button
                    class="status-action status-action--inline app-btn"
                    type="button"
                    onclick={openAccessibilitySettings}
                  >
                    {$t("settings.text.open-system-settings")}</button>
                </div>
              {/if}
              {#if accessibilityNotice}
                <div
                  class="status-hint"
                  class:ok={accessibilityNotice === A11Y_NOTICE_VERIFIED}
                  class:warn={accessibilityNotice === A11Y_NOTICE_ENABLE}
                >
                  {accessibilityNotice}
                </div>
              {/if}
              <div class="status-hint">
                {$t("settings.text.after-a-new-build")}
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title form-section-title--with-icon"><SectionIcon name="voice" />{$t("settings.text.microphone-access")}</div>
            <div class="form-section-body">
              <div class="inset-list">
                <div class="status-step">
                  <div class="status-row">
                    <span
                      class="status-dot"
                      class:ok={microphoneGranted === true && !microphoneUnreadable}
                      class:fail={microphoneGranted === false && !microphoneUnreadable}
                      class:checking={microphoneGranted === null && !microphoneUnreadable}
                    ></span>
                    <span class="status-text">
                      {microphoneUnreadable ? $t("settings.text.microphone-unreadable") : microphoneGranted === null ? $t("settings.text.checking") : microphoneGranted ? $t("settings.text.microphone-granted") : $t("settings.text.microphone-not-granted")}
                    </span>
                    {#if microphoneGranted !== true}
                      <button class="status-action app-btn" type="button" onclick={handleRequestMicrophone}>
                        {$t("settings.text.request")}</button>
                    {/if}
                    {#if microphoneGranted !== false || microphoneUnreadable}
                      <button
                        class="status-action status-action--inline app-btn"
                        type="button"
                        onclick={handleRecheckMicrophone}
                      >
                        {$t("settings.text.recheck")}</button>
                    {/if}
                  </div>
                  {#if microphoneGranted === false}
                    <div class="status-hint">
                      {$t("settings.text.microphone-hint")}<br />
                      {$t("settings.text.microphone-record-hint")}
                    </div>
                    <div class="status-hint">
                      <button
                        class="status-action status-action--inline app-btn"
                        type="button"
                        onclick={openMicrophoneSettings}
                      >
                        {$t("settings.text.open-system-settings")}</button>
                    </div>
                  {/if}
                  {#if microphoneUnreadable}
                    <div class="status-hint warn">
                      {$t("settings.msg.microphone-unreadable")}
                    </div>
                  {:else if micEnablePending && microphoneGranted === false}
                    <div class="status-hint warn">
                      {$t("settings.msg.microphone-not-granted")}
                    </div>
                  {:else if microphoneGranted === true}
                    <div class="status-hint ok">
                      {$t("settings.msg.microphone-granted")}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    {:else if activePane === "updates"}
      <div class="pane-head">
        <div class="pane-title">{$t("nav.updates")}</div>
        <div class="pane-subtitle">{$t("settings.text.this-fork-updates-itself")}</div>
      </div>

      <section class="form-section">
        <div class="form-section-title form-section-title--with-icon"><SectionIcon name="version" />{$t("settings.text.version")}</div>
        <div class="form-section-body">
          <div class="inset-list">
            <div class="status-step">
              <div class="status-row">
                <span class="status-dot" class:ok={!update && !!updateMessage} class:checking={updateChecking}></span>
                <span class="status-text">
                  {$t("settings.text.current-version.1")}<code>{appVersion || "…"}</code>
                  {#if update}{$t("settings.text.current-version.2")}<code>{update.version}</code>{$t("settings.text.current-version.3")}{/if}
                </span>
                <button class="status-action app-btn" type="button" disabled={updateChecking || updateInstalling} onclick={checkUpdates}>
                  {updateChecking ? $t("settings.msg.checking") : $t("settings.msg.check-now")}
                </button>
              </div>
              {#if updateMessage && !update}
                <div class="status-hint">{updateMessage}</div>
              {/if}
              {#if update}
                {#if update.body}
                  <div class="status-hint">{update.body}</div>
                {/if}
                <div class="update-install-actions">
                  <button class="form-btn form-btn-primary app-btn" type="button" disabled={updateInstalling} onclick={installUpdate}>
                    {#if updateInstalling}
                      {updateProgress >= 0 ? $t("settings.msg.installing-percent", { percent: updateProgress }) : $t("settings.msg.installing")}
                    {:else}
                      {$t("settings.text.download-install-then")}
                    {/if}
                  </button>
                </div>
                {#if updateInstalling && updateProgress >= 0}
                  <div class="update-progress" aria-hidden="true">
                    <div class="update-progress-fill" style="width: {updateProgress}%"></div>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-header">
          <div class="form-section-title form-section-title--with-icon"><SectionIcon name="update-log" />{$t("settings.text.update-log")}</div>
          <div class="update-log-actions">
            <button class="form-btn form-btn-secondary app-btn" type="button" onclick={refreshUpdateLog}>{$t("settings.text.refresh")}</button>
            <button class="form-btn form-btn-secondary app-btn" type="button" disabled={updateLog.length === 0} onclick={copyUpdateLog}>{$t("settings.text.copy")}</button>
            <button class="form-btn form-btn-danger app-btn" type="button" disabled={updateLog.length === 0} onclick={clearUpdateLogAndRefresh}>{$t("settings.text.clear")}</button>
          </div>
        </div>
        <div class="form-section-body">
          <div class="form-hint">{$t("settings.text.every-update-step-and")}</div>
          {#if updateLog.length === 0}
            <div class="status-hint">{$t("settings.text.no-update-activity-logged")}</div>
          {:else}
            <pre class="update-log ui-selectable-text">{updateLog.join("\n")}</pre>
          {/if}
          {#if updateLogCopied}
            <div class="status-hint ok" aria-live="polite">{$t("settings.text.copied-to-clipboard")}</div>
          {/if}
        </div>
      </section>
    {:else if activePane === "ai"}
      <div class="pane-head">
        <div class="pane-title">{$t("nav.ai")}</div>
        <div class="pane-subtitle">{$t("settings.text.run-tagging-on-device")}</div>
      </div>

      <section class="form-section">
        <div class="form-section-header">
          <div class="form-section-title form-section-title--with-icon"><SectionIcon name="ai-tagging" />{$t("settings.text.ai-tagging")}</div>
          <label class="toggle">
            <input
              type="checkbox"
              role="switch"
              aria-label={$t("settings.aria-label.enable-ai-tagging")}
              checked={settings.ai_tagging_enabled}
              onchange={(e) => handleAiTaggingToggle((e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="toggle-slider" aria-hidden="true"></span>
          </label>
        </div>
        <fieldset
          class="form-section-body form-section-body--subsections toggle-section-body"
          class:is-disabled={!settings.ai_tagging_enabled}
          disabled={!settings.ai_tagging_enabled}
        >
          <div class="form-hint">
            {$t("settings.text.automatically-tag-clipboard")}
          </div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon"><SectionIcon name="gauge" />{$t("settings.text.setup")}</div>
            <div class="inset-list">
              {#if ollamaStatus === null}
                <div class="status-step">
                  <div class="status-row">
                    <span class="status-dot checking"></span>
                    <span class="status-text">{$t("settings.text.checking")}</span>
                  </div>
                </div>
              {:else}
                <div class="status-step">
                  <div class="status-row">
                    <span class="status-dot" class:ok={ollamaStatus.cli_installed} class:fail={!ollamaStatus.cli_installed}></span>
                    <span class="status-text">
                      {ollamaStatus.cli_installed ? $t("settings.msg.ollama-installed") : $t("settings.msg.ollama-not-installed")}
                    </span>
                    {#if !ollamaStatus.cli_installed}
                      <button class="status-action app-btn" type="button" onclick={() => openUrl("https://ollama.com/download")}>
                        {$t("settings.text.open-ollama-com")}</button>
                    {/if}
                  </div>
                  {#if !ollamaStatus.cli_installed}
                    <div class="status-hint">
                      {$t("settings.text.ollama-runs-ai.1")}<button class="link-btn app-btn" type="button" onclick={() => openUrl("https://ollama.com/download")}>ollama.com</button>{$t("settings.text.ollama-runs-ai.2")}{$t("settings.text.check-again")}{$t("settings.text.ollama-runs-ai.3")}
                    </div>
                  {/if}
                </div>

                <div class="status-step">
                  <div class="status-row">
                    <span class="status-dot" class:ok={ollamaStatus.server_running} class:fail={ollamaStatus.cli_installed && !ollamaStatus.server_running} class:disabled={!ollamaStatus.cli_installed}></span>
                    <span class="status-text" class:dimmed={!ollamaStatus.cli_installed}>
                      {ollamaStatus.server_running ? $t("settings.msg.server-running") : $t("settings.msg.server-not-running")}
                    </span>
                    {#if ollamaStatus.cli_installed && !ollamaStatus.server_running}
                      <button class="status-action app-btn" type="button" disabled={ollamaLoading} onclick={handleStartServer}>
                        {#if ollamaLoading}<span class="app-btn-spinner-icon app-btn-spinner-icon--sm app-btn-spinner-icon--success is-inline"></span> {$t("settings.text.starting")}{:else}{$t("settings.text.start-button")}{/if}
                      </button>
                    {/if}
                  </div>
                  {#if ollamaStatus.cli_installed && !ollamaStatus.server_running}
                    <div class="status-hint">
                      {$t("settings.text.ollama-server-not-running.1")} {$t("settings.text.start-button")} {$t("settings.text.ollama-server-not-running.2")}
                      <code>ollama serve</code>{$t("settings.text.ollama-server-not-running.3")}
                    </div>
                  {/if}
                </div>

                <div class="status-step">
                  <div class="status-row">
                    <span class="status-dot" class:ok={ollamaStatus.model_installed} class:fail={ollamaStatus.server_running && !ollamaStatus.model_installed} class:disabled={!ollamaStatus.server_running}></span>
                    <span class="status-text" class:dimmed={!ollamaStatus.server_running}>
                      {ollamaStatus.model_installed ? $t("settings.msg.model-ready") : $t("settings.msg.model-not-installed")}
                    </span>
                    {#if ollamaStatus.server_running && !ollamaStatus.model_installed}
                      <button class="status-action app-btn" type="button" disabled={ollamaLoading} onclick={handlePullModel}>
                        {#if ollamaLoading}<span class="app-btn-spinner-icon app-btn-spinner-icon--sm app-btn-spinner-icon--success is-inline"></span> {$t("settings.text.pulling")}{:else}{$t("settings.text.download-button")}{/if}
                      </button>
                    {/if}
                    {#if ollamaStatus.model_installed}
                      <button class="status-action app-btn" type="button" onclick={async () => { await unloadOllamaModel(); settingsNotice = tr("settings.msg.model-unloaded-from"); }}>
                        {$t("settings.text.unload")}</button>
                    {/if}
                  </div>
                  {#if pullProgress}
                    <div class="status-hint pull-progress">
                      <span class="app-btn-spinner-icon app-btn-spinner-icon--sm app-btn-spinner-icon--success is-inline"></span> {pullProgress}
                    </div>
                  {:else if ollamaStatus.server_running && !ollamaStatus.model_installed}
                    <div class="status-hint">
                      {$t("settings.text.model")} <code>{ollamaStatus.model_name}</code> {$t("settings.text.ollama-model-missing.2")}
                      {$t("settings.text.ollama-model-missing.3")} {$t("settings.text.download-button")} {$t("settings.text.ollama-model-missing.4")} <code>ollama pull {ollamaStatus.model_name}</code> {$t("settings.text.ollama-model-missing.5")}
                      {$t("settings.text.ollama-model-missing.6")}
                    </div>
                  {:else if ollamaStatus.model_installed}
                    <div class="status-hint ok">
                      {$t("settings.text.using")} <code>{ollamaStatus.model_name}</code>
                    </div>
                  {/if}
                </div>

                <div class="status-step">
                  <div class="status-row">
                    <span class="status-dot" class:ok={taggingResult !== undefined && taggingResult !== null} class:fail={taggingResult === null} class:disabled={!ollamaStatus.model_installed}></span>
                    <span class="status-text" class:dimmed={!ollamaStatus.model_installed}>
                      {#if taggingResult === undefined}
                        {$t("settings.text.tagging-not-tested")}
                      {:else if taggingResult !== null}
                        {$t("settings.text.tagging-works")}
                      {:else}
                        {$t("settings.text.tagging-failed")}
                      {/if}
                    </span>
                    {#if ollamaStatus.model_installed}
                      <button class="status-action app-btn" type="button" disabled={taggingLoading || modelDirty} onclick={handleTestTagging} title={modelDirty ? $t("settings.msg.save-settings-first") : ""}>
                        {#if taggingLoading}
                          <span class="app-btn-spinner-icon app-btn-spinner-icon--sm app-btn-spinner-icon--success is-inline"></span> {$t("settings.text.testing")}
                        {:else}
                          {$t("settings.text.test")}
                        {/if}
                      </button>
                    {/if}
                  </div>
                  {#if modelDirty}
                    <div class="status-hint fail">
                      {$t("settings.text.model-changed-save")}
                    </div>
                  {:else if taggingLoading}
                    <div class="status-hint">
                      {$t("settings.text.sending-test-request")}
                    </div>
                  {:else if taggingResult !== undefined && taggingResult !== null}
                    <div class="status-hint ok">
                      {$t("settings.text.test-result", { tags: taggingResult.join(", ") })}
                    </div>
                  {:else if taggingResult === null}
                    <div class="status-hint fail">
                      {$t("settings.text.the-model-did")}
                    </div>
                  {:else if ollamaStatus.model_installed}
                    <div class="status-hint">
                      {$t("settings.text.click-test-verify.1")}{$t("settings.text.test")}{$t("settings.text.click-test-verify.2")}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
            {#if ollamaStatus !== null}
              <div class="status-list-footer">
                <button class="form-btn form-btn-ghost app-btn" type="button" disabled={ollamaLoading} onclick={refreshOllamaStatus}>
                  {$t("settings.text.check-again")}</button>
              </div>
            {/if}
          </div>

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon"><SectionIcon name="ollama-model" />{$t("settings.text.ollama-model")}</div>
            <div class="inset-list">
              <div class="form-field">
                <select
                  class="form-select"
                  aria-label={$t("settings.aria-label.ollama-model")}
                  bind:value={selectedModelPreset}
                  onchange={(e) => handleModelPresetChange((e.currentTarget as HTMLSelectElement).value)}
                >
                  {#each modelCatalog.options as option}
                    <option value={option.value}>
                      {option.label} · ~{option.memory_gb.toFixed(1)} GB · {option.fits ? $t("settings.text.fits") : $t("settings.msg.too-large")}{option.installed ? $t("settings.text.installed-suffix") : ""}
                    </option>
                  {/each}
                  <option value="__custom__">{$t("settings.text.custom-model")}</option>
                </select>
              </div>
              {#if selectedModelPreset === "__custom__"}
                <div class="form-field">
                  <label class="form-label" for="custom-ollama-model">{$t("settings.text.model-name")}</label>
                  <input
                    id="custom-ollama-model"
                    class="form-input"
                    type="text"
                    bind:value={settings.ollama_model}
                    placeholder="qwen3:4b-instruct-2507-q4_K_M"
                  />
                  <div class="form-hint">{$t("settings.text.memory-use-cannot-be")}</div>
                </div>
              {/if}
            </div>
          </div>

          <div class="form-subsection-rule" role="separator"></div>

          <div class="form-subsection">
            <div class="form-subsection-title form-subsection-title--with-icon"><SectionIcon name="this-mac" />{$t("settings.text.this-mac")}</div>
            <dl class="form-meta inset-list" aria-label={$t("settings.aria-label.machine-memory-details")}>
              <div class="form-meta-item">
                <dt>{$t("settings.text.machine-ram")}</dt>
                <dd>{modelCatalog.total_memory_gb.toFixed(1)} GB</dd>
              </div>
              <div class="form-meta-item">
                <dt>{$t("settings.text.recommended-ollama-budget")}</dt>
                <dd>{modelCatalog.recommended_memory_gb.toFixed(1)} GB</dd>
              </div>
              {#if selectedModelMeta}
                <div class="form-meta-item">
                  <dt>{selectedModelMeta.label}</dt>
                  <dd class:fits={selectedModelMeta.fits} class:tight={!selectedModelMeta.fits}>
                    ~{selectedModelMeta.memory_gb.toFixed(1)} GB · {selectedModelMeta.fits ? $t("settings.text.fits") : $t("settings.msg.too-large")}
                  </dd>
                </div>
              {/if}
            </dl>
          </div>
        </fieldset>
      </section>
    {:else if activePane === "history"}
      <div class="pane-head">
        <div class="pane-title">{$t("nav.history")}</div>
        <div class="pane-subtitle">{$t("settings.text.layout-how-long-clips")}</div>
      </div>

      <section class="form-section">
        <div class="form-section-title form-section-title--with-icon"><SectionIcon name="clipboard-panel" />{$t("settings.text.board-layout")}</div>
        <div class="form-section-body">
          <div class="inset-list">
            <label class="form-checkbox">
              <span class="form-checkbox-leading">
                <input
                  type="checkbox"
                  checked={settings.board_vertical}
                  onchange={(e) =>
                    handleBoardVerticalToggle((e.currentTarget as HTMLInputElement).checked)}
                />
                <span class="form-checkbox-box" aria-hidden="true"></span>
              </span>
              <span class="form-checkbox-label ui-selectable-text">
                <span class="form-pref-label">{$t("settings.text.vertical-board")}</span>
                <span class="form-pref-hint">{$t("settings.text.tall-panel-docked-to")}</span>
              </span>
            </label>
            <label class="form-checkbox">
              <span class="form-checkbox-leading">
                <input
                  type="checkbox"
                  checked={settings.overlay_shortcut_hints_enabled}
                  onchange={(e) =>
                    handleOverlayShortcutHintsToggle((e.currentTarget as HTMLInputElement).checked)}
                />
                <span class="form-checkbox-box" aria-hidden="true"></span>
              </span>
              <span class="form-checkbox-label ui-selectable-text">
                <span class="form-pref-label">{$t("settings.text.keyboard-shortcuts")}</span>
                <span class="form-pref-hint">{$t("settings.text.show-hint-strips-along")}</span>
              </span>
            </label>
            <div class="form-pref-row">
              <div class="form-pref-copy">
                <span class="form-pref-label">{$t("settings.text.restore-default-size")}</span>
                <span class="form-pref-hint">{$t("settings.text.resets-the-panel-s")}</span>
              </div>
              <button
                class="form-btn form-btn-secondary app-btn"
                type="button"
                onclick={() => void handleRestoreOverlayBoardSizes()}
              >
                {$t("settings.text.restore-defaults")}</button>
            </div>
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-title form-section-title--with-icon"><SectionIcon name="privacy" />{$t("settings.text.privacy")}</div>
        <div class="form-section-body">
      {#if platformIsMacOS()}
        <div class="form-field excluded-apps-field">
          <span class="form-label">{$t("settings.text.excluded-apps")}</span>
          <div class="form-hint">
            {$t("settings.text.clipboard-from-excluded-apps")}</div>

          <div class="excluded-apps-stack">
            <div class="excluded-apps-panel inset-list" role="group" aria-label={$t("settings.aria-label.excluded-applications")}>
              {#if excludableCandidate}
                <div class="excluded-apps-row excluded-apps-row--candidate">
                  <div class="excluded-apps-row-leading">
                    <span class="excluded-apps-row-label">{excludableCandidate.displayName}</span>
                    {#if !excludableCandidate.alreadyExcluded}
                      <span class="excluded-apps-row-sep" aria-hidden="true">·</span>
                      <span class="excluded-apps-row-meta"
                        >{excludableCandidateMetaLabel(excludableCandidate.source)}</span
                      >
                    {/if}
                  </div>
                  {#if excludableCandidate.alreadyExcluded && activeExcludedEntry}
                    {@const removeLabel = allowInClipboardHistoryAriaLabel(excludableCandidate.displayName)}
                    <button
                      class="form-link-accent excluded-list-action app-btn"
                      type="button"
                      aria-label={removeLabel}
                      aria-busy={excludeActionBusy}
                      disabled={excludeActionBusy}
                      onclick={() =>
                        handleRemoveExcludedApp(activeExcludedEntry.id, activeExcludedEntry.displayName)}
                    >
                      <span class="excluded-list-action-icon" aria-hidden="true">−</span>
                      <span>{excludeListRemoveLabel()}</span>
                    </button>
                  {:else if excludableCandidate.alreadyExcluded}
                    <span class="excluded-apps-row-meta">{alreadyExcludedListMetaLabel()}</span>
                  {:else}
                    {@const addLabel = excludeFromClipboardHistoryAriaLabel(excludableCandidate.displayName)}
                    <button
                      class="form-link-restrict excluded-list-action app-btn"
                      type="button"
                      aria-label={addLabel}
                      aria-busy={excludeActionBusy}
                      disabled={excludeActionBusy}
                      onclick={handleAddCandidateApp}
                    >
                      <span class="excluded-list-action-icon" aria-hidden="true">+</span>
                      <span>{excludeListAddLabel()}</span>
                    </button>
                  {/if}
                </div>
              {/if}

              {#each listedExcludedApps as app (app.id)}
                <div class="excluded-apps-row excluded-apps-row--listed">
                  <span class="excluded-apps-row-label">{app.displayName}</span>
                  <button
                    class="form-link-accent excluded-list-action app-btn"
                    type="button"
                    aria-label={allowInClipboardHistoryAriaLabel(app.displayName)}
                    aria-busy={excludeActionBusy}
                    disabled={excludeActionBusy}
                    onclick={() => handleRemoveExcludedApp(app.id, app.displayName)}
                  >
                    <span class="excluded-list-action-icon" aria-hidden="true">−</span>
                    <span>{excludeListRemoveLabel()}</span>
                  </button>
                </div>
              {/each}

              {#if !excludedAppsPanelHasRows}
                <div class="excluded-apps-empty" role="status">{$t("settings.text.no-apps-excluded-yet")}</div>
              {/if}

              <FieldStatusFooter message={excludedAppsNotice} tone={excludedAppsNoticeTone} />
            </div>

            <button
              class="form-btn form-btn-secondary excluded-choose-app-btn app-btn"
              type="button"
              class:is-busy={excludeActionBusy}
              class:is-locked={excludeActionBusy}
              aria-busy={excludeActionBusy ? "true" : undefined}
              disabled={excludeActionBusy}
              onclick={handleChooseApp}
            >
              <svg
                class="form-btn-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="5.5" width="12" height="12" rx="2.5" />
                <path d="M17 10.5v8" />
                <path d="M13 14.5h8" />
              </svg>
              <span class="app-btn-label">{chooseApplicationActionLabel()}</span>
              {@render busySpinner()}
            </button>

            <div class="form-inline excluded-by-name">
              <input
                class="form-input"
                type="text"
                bind:value={excludedAppInput}
                placeholder={$t("settings.placeholder.installed-app-name-e")}
                aria-label={$t("settings.aria-label.installed-app-name-to")}
                onkeydown={(e) => {
                  if (e.key === "Enter") void handleAddExcludedByName();
                }}
              />
              <button
                class="form-btn form-btn-secondary app-btn"
                type="button"
                onclick={handleAddExcludedByName}
              >
                {$t("exclusion.text.add")}
              </button>
            </div>
          </div>
        </div>
      {:else}
        <div class="form-hint">{$t("settings.text.app-exclusion-is-available")}</div>
      {/if}
    </div>
      </section>

      <section class="form-section">
        <div class="form-section-title form-section-title--with-icon"><SectionIcon name="storage" />{$t("settings.text.storage")}</div>
        <div class="form-section-body">
          <div class="inset-list">
            <label class="form-field">
              <span class="form-label">{$t("settings.text.history-retention")}</span>
              <select class="form-select" bind:value={settings.retention_days}>
                {#each retentionOptions as option}
                  <option value={option.value}>{$t(option.labelKey)}</option>
                {/each}
              </select>
            </label>
            <div class="form-field">
              <ActionMenu
                block
                disabled={clearHistoryMenuDisabled}
                label={$t("settings.label.clear-history")}
                items={clearHistoryMenuItems}
                onselect={(id) => void handleClearHistoryMenu(id as ClearHistoryAction)}
              />
            </div>
          </div>
          <div
            class="form-note form-note-neutral storage-clear-notice"
            class:visible={!!clearHistoryNotice}
            aria-live="polite"
          >
            {clearHistoryNotice}
          </div>
        </div>
      </section>
    {:else if activePane === "general"}
      <div class="pane-head">
        <div class="pane-title">{$t("general.title")}</div>
        <div class="pane-subtitle">{$t("general.subtitle")}</div>
      </div>

      <section class="form-section">
        <div class="form-section-header">
          <div class="form-section-title form-section-title--with-icon">
            <SectionIcon name="login" />{$t("general.launchAtLogin")}
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              role="switch"
              aria-label={$t("general.launchAtLogin")}
              checked={launchAtLogin}
              disabled={launchAtLoginBusy}
              onchange={(e) =>
                void toggleLaunchAtLogin((e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="toggle-slider" aria-hidden="true"></span>
          </label>
        </div>
        <div class="form-section-body">
          <div class="form-hint">{$t("general.launchAtLoginHint")}</div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-title form-section-title--with-icon">
          <SectionIcon name="globe" />{$t("language.title")}
        </div>
        <div class="form-section-body">
          <div class="form-hint">{$t("language.subtitle")}</div>
          <div class="inset-list">
            <label class="form-field">
              <span class="form-label">{$t("language.label")}</span>
              <select
                class="form-select"
                value={$locale}
                onchange={(e) => {
                  const code = (e.currentTarget as HTMLSelectElement).value as LocaleCode;
                  setLocale(code);

                }}
              >
                {#each LOCALES as l}
                  <option value={l.code}>{l.label}</option>
                {/each}
              </select>
            </label>
          </div>
          <div class="form-hint">{$t("language.hint")}</div>
        </div>
      </section>
    {/if}
  </main>
</div>

{#if isDirty}
  <div class="dirty-bar">
    <div class="dirty-bar-inner">
      <span class="dirty-label">{$t("settings.text.unsaved-changes")}</span>
      <div class="dirty-actions">
      <button class="dirty-reset" type="button" onclick={resetSettings}>{$t("settings.text.reset")}</button>
      <button class="dirty-save" type="button" disabled={savingSettings} onclick={saveSettings}>
        {savingSettings ? $t("settings.msg.saving") : $t("settings.text.save")}
      </button>
      </div>
    </div>
  </div>
{:else if settingsNotice}
  <div class="dirty-bar saved">
    <div class="dirty-bar-inner">
      <span class="dirty-label">{settingsNotice}</span>
    </div>
  </div>
{/if}

<ConfirmDialog />

<style>
  :global(body) {
    background: var(--surface-page);
    font-family: var(--font-family-system);
    color: var(--color-text-body);
  }

  .settings-shell {
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    overflow-x: clip;
  }

  .settings-sidebar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 12px;
    background: var(--surface-sidebar);
    border-right: 1px solid var(--border-muted);
    min-height: 0;
    height: 100%;
  }

  .sidebar-title {
    padding: 4px 10px 12px;
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--font-size-sm);
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-interactive), color var(--duration-fast) var(--ease-interactive);
  }

  .nav-item:hover {
    background: var(--surface-5);
    color: var(--color-text-primary);
  }

  .nav-item.active {
    background: var(--surface-accent-muted);
    border-color: var(--border-accent-soft);
    color: var(--color-text-primary);
  }

  .nav-item :global(.nav-section-icon) {
    width: var(--icon-size-section);
    height: var(--icon-size-section);
    flex-shrink: 0;
    color: var(--color-accent-icon);
  }

  .sidebar-foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: var(--space-stack);
    padding: 8px 10px;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .sidebar-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--surface-10);
    flex-shrink: 0;
  }

  .sidebar-dot.ok {
    background: var(--color-success-soft);
    box-shadow: 0 0 8px var(--shadow-success);
  }

  .sidebar-dot.fail {
    background: var(--color-danger-soft);
  }

  /* Полоса прокрутки принадлежит окну, а не колонке: иначе в широком окне она
     стоит посреди экрана, а справа от неё пустое место. */
  .settings-content {
    padding: 36px 20px 88px;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden auto;
  }

  /* Колонка содержимого: комфортная ширина строки, по центру реальной ширины окна. */
  .settings-content > * {
    max-width: 740px;
    margin-inline: auto;
  }

  .pane-head {
    margin-bottom: var(--space-island-gap);
  }

  .pane-title {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
  }

  .pane-subtitle {
    margin-top: 4px;
    font-size: var(--font-size-md);
    color: var(--color-text-tertiary);
    line-height: var(--line-height-body);
  }

  .form-hint.ok {
    color: var(--color-success-text);
  }

  .form-hint.fail {
    color: var(--color-danger-text);
  }

  .form-meta-item dd.fits {
    color: var(--color-success-text);
  }

  .form-meta-item dd.tight {
    color: var(--color-warning-text);
  }

  /* Полоса остаётся на всю ширину окна — это её фон, — но содержимое выравнивается по той
     же колонке, что и панели настроек: иначе в широком окне надпись и кнопка уезжают
     от карточек. */
  .dirty-bar {
    position: fixed;
    left: 184px;
    right: 0;
    bottom: 0;
    padding: var(--overlay-grid-pad-y) var(--overlay-header-pad-block);
    background: var(--surface-bar);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--border-muted);
  }

  .dirty-bar-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--control-chevron-inset);
    width: 100%;
    max-width: 740px;
    margin-inline: auto;
  }

  .dirty-bar.saved {
    justify-content: flex-start;
  }

  .dirty-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-warning-text);
  }

  .dirty-bar.saved .dirty-label {
    color: var(--color-success-text);
  }

  .dirty-actions {
    display: flex;
    gap: var(--space-stack);
  }

  .dirty-reset {
    min-height: 36px;
    padding: 0 14px;
    background: var(--surface-5);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-control);
    color: var(--color-text-body);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .dirty-save {
    min-height: 36px;
    padding: 0 18px;
    background: var(--surface-accent);
    border: 1px solid var(--border-accent-soft);
    border-radius: var(--radius-control);
    color: var(--color-text-primary);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .dirty-save:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .update-install-actions {
    display: flex;
    align-items: center;
    gap: var(--space-stack);
  }

  .update-progress {
    margin-top: var(--space-stack);
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--surface-7);
    overflow: hidden;
  }

  .update-progress-fill {
    height: 100%;
    background: var(--color-success);
    border-radius: var(--radius-pill);
    transition: width var(--duration-standard) var(--ease-interactive);
  }

  .update-log-actions {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-stack);
  }

  .update-log-actions :global(.form-btn) {
    min-height: var(--size-hit-target-sm);
    padding-inline: var(--space-control-x);
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .update-log {
    margin: 0;
    max-height: 220px;
    overflow: auto;
    padding: var(--inset-list-pad-block) var(--inset-list-pad-inline);
    border-radius: var(--radius-control);
    background: var(--surface-code-block);
    border: 1px solid var(--border-default);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-2xs-sm);
    line-height: var(--line-height-relaxed);
    color: var(--color-text-subtle);
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
