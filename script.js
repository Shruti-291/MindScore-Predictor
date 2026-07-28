/* ============================================================
   Mindscope — frontend logic
   ============================================================ */
(() => {
  "use strict";

  const API_BASE = "https://mindscore-predictor-jjsw.onrender.com";
  const PREDICT_URL = `${API_BASE}/predict`;

  const form        = document.getElementById("predict-form");
  const submitBtn   = document.getElementById("submit-btn");
  const formError    = document.getElementById("form-error");

  const resultCard  = document.getElementById("result-card");
  const views = {
    idle:    document.querySelector('[data-view="idle"]'),
    loading: document.querySelector('[data-view="loading"]'),
    result:  document.querySelector('[data-view="result"]'),
    error:   document.querySelector('[data-view="error"]'),
  };

  const scoreNumberEl = document.getElementById("score-number");
  const gaugeFillResult = document.getElementById("gauge-fill-result");
  const resultBadge = document.getElementById("result-badge");
  const resultCopy = document.getElementById("result-copy");
  const errorCopy = document.getElementById("error-copy");

  const GAUGE_CIRC = 251.2; // matches stroke-dasharray in CSS
  const GAUGE_MAX = 10;     // assumed display scale for the gauge

  /* ---------- live range labels ---------- */
  const rangeIds = [
    "avg_daily_usage_hours",
    "study_hours",
    "physical_activity_hours",
    "sleep_hours_per_night",
  ];

  rangeIds.forEach((id) => {
    const input = document.getElementById(id);
    const out = document.getElementById(`${id}-out`);
    const update = () => {
      const val = parseFloat(input.value);
      out.textContent = `${val.toFixed(1)} h`;
      const pct = ((val - input.min) / (input.max - input.min)) * 100;
      input.style.setProperty("--fill", `${pct}%`);
    };
    input.addEventListener("input", update);
    update();
  });

  /* ---------- view switching ---------- */
  function showView(name) {
    resultCard.dataset.state = name;
    Object.entries(views).forEach(([key, el]) => {
      if (!el) return;
      el.hidden = key !== name;
    });
  }

  /* ---------- gauge helper ---------- */
  function setGauge(el, value) {
    const clamped = Math.max(0, Math.min(GAUGE_MAX, value));
    const offset = GAUGE_CIRC - (clamped / GAUGE_MAX) * GAUGE_CIRC;
    // force reflow so the transition always plays
    requestAnimationFrame(() => {
      el.style.strokeDashoffset = String(offset);
    });
  }

  function tierFor(value) {
    if (value >= 7) return { tier: "elevated", label: "Higher end of range" };
    if (value >= 4) return { tier: "moderate", label: "Mid range" };
    return { tier: "calm", label: "Lower end of range" };
  }

  /* ---------- field readers ---------- */
  function getNumber(id) {
    const v = document.getElementById(id).value;
    return v === "" ? null : Number(v);
  }
  function getText(id) {
    return document.getElementById(id).value.trim();
  }

  function buildPayload() {
    return {
      age: getNumber("age"),
      gender: getText("gender"),
      country: getText("country"),
      academic_level: getText("academic_level"),
      most_used_platform: getText("most_used_platform"),
      purpose_of_use: getText("purpose_of_use"),
      avg_daily_usage_hours: getNumber("avg_daily_usage_hours"),
      daily_unlocks: getNumber("daily_unlocks"),
      study_hours: getNumber("study_hours"),
      physical_activity_hours: getNumber("physical_activity_hours"),
      sleep_hours_per_night: getNumber("sleep_hours_per_night"),
      stress_level: getText("stress_level"),
    };
  }

  /* ---------- client-side validation ---------- */
  function validate(payload) {
    const problems = [];
    if (payload.age === null || payload.age < 10 || payload.age > 100)
      problems.push("Age must be between 10 and 100.");
    if (!payload.gender) problems.push("Please choose a gender.");
    if (!payload.country) problems.push("Please enter a country.");
    if (!payload.academic_level) problems.push("Please choose an academic level.");
    if (!payload.most_used_platform) problems.push("Please choose a platform.");
    if (!payload.purpose_of_use) problems.push("Please choose a purpose of use.");
    if (payload.daily_unlocks === null || payload.daily_unlocks < 0)
      problems.push("Daily unlocks can't be negative.");
    if (!payload.stress_level) problems.push("Please choose a stress level.");
    return problems;
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }
  function clearFormError() {
    formError.hidden = true;
    formError.textContent = "";
  }

  /* ---------- submit ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError();

    const payload = buildPayload();
    const problems = validate(payload);
    if (problems.length) {
      showFormError(problems.join(" "));
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add("is-loading");
    showView("loading");

    try {
      const response = await fetch(PREDICT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let detailMsg = `Request failed with status ${response.status}.`;
        try {
          const errBody = await response.json();
          if (errBody?.detail) {
            detailMsg = Array.isArray(errBody.detail)
              ? errBody.detail
                  .map((d) => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`)
                  .join(" · ")
              : String(errBody.detail);
          }
        } catch (_) {
          /* body wasn't JSON, keep default message */
        }
        throw new Error(detailMsg);
      }

      const data = await response.json();
      const score = Number(data.predicted_mental_health_score);
      renderResult(score);
    } catch (err) {
      renderError(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-loading");
    }
  });

  function renderResult(score) {
    const safeScore = Number.isFinite(score) ? score : 0;
    scoreNumberEl.textContent = safeScore.toFixed(1).replace(/\.0$/, "");
    setGauge(gaugeFillResult, safeScore);

    const { tier, label } = tierFor(safeScore);
    resultBadge.textContent = label;
    resultBadge.dataset.tier = tier;

    resultCopy.textContent =
      "This estimate is based on the habits you entered — usage, sleep, study, and activity all played a part.";

    showView("result");
  }

  function renderError(err) {
    const isNetworkError = err instanceof TypeError;
    errorCopy.textContent = isNetworkError
      ? `Couldn't connect to the API at ${API_BASE}. Make sure the FastAPI server is running with: uvicorn main:app --port 2200 --reload`
      : err.message || "The prediction service returned an unexpected error.";
    showView("error");
  }

  /* ---------- reset ---------- */
  document.getElementById("reset-btn").addEventListener("click", () => {
    showView("idle");
  });
  document.getElementById("error-retry-btn").addEventListener("click", () => {
    showView("idle");
  });
})();
