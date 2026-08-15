/**
 * Vintus Performance — Client Dashboard (TrainingPeaks-inspired)
 * Full rewrite: weekly calendar, workout detail, metrics, check-in, trends, chat.
 */

(function () {
  // Auth guard
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }
  if (localStorage.getItem('vintus_role') === 'ADMIN') {
    window.location.href = '/admin';
    return;
  }

  // ── Constants ──
  var DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  var TIER_DISPLAY = {
    PRIVATE_COACHING: 'Private Coaching',
    TRAINING_30DAY: '30-Day',
    TRAINING_60DAY: '60-Day',
    TRAINING_90DAY: '90-Day',
    NUTRITION_4WEEK: '4-Week Nutrition',
    NUTRITION_8WEEK: '8-Week Nutrition'
  };

  var SESSION_TYPE_ICONS = {
    STRENGTH: 'STR',
    CARDIO: 'CARDIO',
    HIIT: 'HIIT',
    FLEXIBILITY: 'FLEX',
    RECOVERY: 'REC',
    CONDITIONING: 'COND',
    POWER: 'PWR',
    ENDURANCE: 'END',
    MOBILITY: 'MOB',
    SPORT_SPECIFIC: 'SPORT'
  };

  // ── State ──
  var currentTier = null;
  var planStartDateStr = null;
  var nutritionAccessType = null; // 'purchased' | 'concierge' | null
  var currentWeekOffset = 0;
  var weekSessions = [];
  var overviewData = null;
  var dailySummaryData = null;
  var selectedDate = null;
  var todaySession = null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Timezone-safe date helper ──
  function toLocalDateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getWeekMonday(offset) {
    var d = new Date(today);
    var dayOfWeek = d.getDay();
    var diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    d.setDate(d.getDate() - diff + (offset * 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ── Slider live updates ──
  ['ciEnergy', 'ciSoreness', 'ciMood', 'ciSleep'].forEach(function (id) {
    var slider = document.getElementById(id);
    var valEl = document.getElementById(id + 'Val');
    if (slider && valEl) {
      slider.addEventListener('input', function () { valEl.textContent = this.value; });
    }
  });

  // ── Load everything ──
  loadUser();
  loadOverview().then(function (isPending) {
    if (!isPending) {
      loadWeek(0);
      loadTrends();
    }
  });

  // ============================================================
  // User Info → Header
  // ============================================================

  async function loadUser() {
    try {
      var res = await apiGet('/api/v1/auth/me');
      if (res.success && res.data && res.data.user) {
        var user = res.data.user;
        var profile = user.athleteProfile;
        var name = (profile && profile.firstName) || user.email.split('@')[0];
        document.getElementById('athleteName').textContent = name;
      }
    } catch (err) {
      // Keep default
    }
  }

  // ============================================================
  // Overview → Progress, Metrics, Today's Workout
  // ============================================================

  async function loadOverview() {
    try {
      var res = await apiGet('/api/v1/dashboard/overview');
      if (!res.success || !res.data) return false;

      var d = res.data;
      overviewData = d;

      // Check pending approval
      if (d.athlete && d.athlete.subscriptionStatus === 'PENDING_APPROVAL') {
        showPendingState(d);
        return true;
      }

      // No plan of any kind at all (e.g. completed the assessment but never
      // purchased) — nothing to show here, send them to pick a plan instead
      // of rendering an empty dashboard. A nutrition-only client (no
      // training/coaching plan) still has something to show, so only
      // redirect if neither exists.
      if (d.athlete && !d.athlete.planTier && !d.athlete.hasNutritionPlan) {
        window.location.href = '/features';
        return true;
      }

      if (d.athlete && d.athlete.planStartDate) {
        planStartDateStr = d.athlete.planStartDate;
      }

      // Header badges
      if (d.athlete && d.athlete.planTier) {
        currentTier = d.athlete.planTier;
        var tierBadge = document.getElementById('tierBadge');
        tierBadge.textContent = TIER_DISPLAY[currentTier] || currentTier;
        tierBadge.style.display = 'inline-flex';

        // Billing/subscription management only applies to the recurring
        // Private Coaching plan — one-time Training/Nutrition purchases have
        // no Stripe subscription portal to manage. Coach chat, though, is
        // available to every paying client regardless of tier.
        if (currentTier === 'PRIVATE_COACHING') {
          document.getElementById('manageSubBtn').style.display = 'inline-flex';
        }

        // Direct text line to the coach — a Private Coaching concierge
        // perk, not offered on the lower one-time-purchase tiers.
        var directLineCard = document.getElementById('directLineCard');
        if (directLineCard) {
          directLineCard.style.display = currentTier === 'PRIVATE_COACHING' ? 'flex' : 'none';
          if (currentTier === 'PRIVATE_COACHING') loadWeeklyCallStatus();
        }

        // Full Plan view only applies to fixed-term Training tiers -- every
        // week is generated upfront at purchase, so there's a real start-to-
        // finish plan to show. Private Coaching has no fixed end date.
        var fullPlanLink = document.getElementById('viewFullPlanLink');
        if (fullPlanLink) {
          var isFixedTermTraining = currentTier === 'TRAINING_30DAY' || currentTier === 'TRAINING_60DAY' || currentTier === 'TRAINING_90DAY';
          fullPlanLink.style.display = isFixedTermTraining ? 'flex' : 'none';
        }
      }

      if (d.athlete && d.athlete.dayNumber && d.athlete.totalDays) {
        var dayBadge = document.getElementById('dayBadge');
        dayBadge.textContent = 'Day ' + d.athlete.dayNumber + ' of ' + d.athlete.totalDays;
        dayBadge.style.display = 'inline-flex';

        // Progress bar
        var pct = Math.min(100, Math.round((d.athlete.dayNumber / d.athlete.totalDays) * 100));
        var progressEl = document.getElementById('planProgress');
        progressEl.style.display = 'block';
        document.getElementById('progressFill').style.width = pct + '%';

        var weekNum = Math.ceil(d.athlete.dayNumber / 7);
        var totalWeeks = Math.ceil(d.athlete.totalDays / 7);
        document.getElementById('progressText').innerHTML =
          '<span>Week ' + weekNum + ' of ' + totalWeeks + '</span>' +
          '<span>' + pct + '% complete</span>';
      }

      // Metrics
      renderMetrics(d);

      // Today's workout — only relevant when there's a training/coaching plan
      if (d.athlete && d.athlete.planTier) {
        renderTodayWorkout(d);
      }

      // Nutrition plan — fetch whenever one might exist, regardless of the
      // primary tier, since nutrition is a separate add-on plan now (or, for
      // an active Private Coaching client, a bundled concierge benefit)
      if (d.athlete && d.athlete.hasNutritionPlan) {
        nutritionAccessType = d.athlete.nutritionAccessType || null;
        loadNutritionPlan();
        loadNutritionProgress();
      }

      // Macro Calculator add-on — pre-fill the form/results if already purchased
      if (d.athlete && d.athlete.macroCalculatorAddon) {
        renderMacroCalculator(d.athlete.macroCalculatorAddon);
      }

      // Tabs decide section visibility for training/nutrition/macro-calculator
      // — single-plan clients get no tabs and just see that one section.
      if (d.athlete) {
        setupPlanTabs(d.athlete);
      }

      updateAddonsButtonVisibility(d);
      updatePrefsButtonVisibility(d);

      // 30-day milestone report, if one's due
      if (d.milestoneReport) {
        showMilestoneReport(d.milestoneReport);
      }

      return false;
    } catch (err) {
      document.getElementById('todayWorkout').innerHTML =
        '<div class="tp-rest-day"><div class="tp-rest-day__text">Unable to load. Please try refreshing.</div></div>';
      return false;
    }
  }

  function showPendingState(d) {
    if (d.athlete && d.athlete.planTier) {
      currentTier = d.athlete.planTier;
      var tierBadge = document.getElementById('tierBadge');
      tierBadge.textContent = TIER_DISPLAY[currentTier] || currentTier;
      tierBadge.style.display = 'inline-flex';
    }

    document.getElementById('todayWorkout').innerHTML =
      '<div class="tp-pending">' +
        '<div class="tp-pending__icon">&#9203;</div>' +
        '<h3 class="tp-pending__title">Your Account is Being Reviewed</h3>' +
        '<p class="tp-pending__text">Thanks for signing up! Your coach is reviewing your profile and will activate your account shortly. You\'ll receive a welcome message once approved.</p>' +
      '</div>';

    document.getElementById('weekGrid').innerHTML =
      '<div style="grid-column:1/-1;text-align:center;color:var(--gray);padding:1.5rem;font-style:italic;">Your training week will appear here once approved.</div>';

    // Hide sections that need data
    document.getElementById('metricsRow').style.display = 'none';
    var trendsCard = document.getElementById('trendsChart');
    if (trendsCard) trendsCard.closest('.tp-trends').style.display = 'none';
  }

  // ============================================================
  // Weekly Coaching Call status (button copy on the Direct Line card)
  // ============================================================

  async function loadWeeklyCallStatus() {
    var btnText = document.getElementById('scheduleCallBtnText');
    if (!btnText) return;
    try {
      var res = await apiGet('/api/v1/dashboard/weekly-call');
      if (res.success && res.data && res.data.booking) {
        var b = res.data.booking;
        var d = new Date(b.scheduledDate + 'T12:00:00');
        var dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        btnText.textContent = 'Next Call: ' + dayLabel;
      }
    } catch (err) {
      // Leave the default "Book Weekly Call" label if this fails.
    }
  }

  // ============================================================
  // PLAN TABS — training/coaching, nutrition, and macro-calculator add-on.
  // Shown whenever a client has more than one of these; a single-plan
  // client sees no tabs and just gets that one section. Generic over
  // however many of the three apply, since they aren't mutually exclusive
  // (e.g. a Training Plan client could buy the macro add-on, then later
  // add a full Nutrition Plan too).
  // ============================================================

  var planTabsBound = false;

  function setupPlanTabs(athlete) {
    var tabsEl = document.getElementById('planTabs');
    var tabTraining = document.getElementById('tabTraining');
    var tabNutrition = document.getElementById('tabNutrition');
    var tabMacro = document.getElementById('tabMacroCalc');
    var allContent = [
      document.getElementById('trainingTabContent'),
      document.getElementById('nutritionSection'),
      document.getElementById('macroCalcSection')
    ];

    var trainingLabel = (TIER_DISPLAY[athlete.planTier] || athlete.planTier) +
      (athlete.planTier === 'PRIVATE_COACHING' ? '' : ' Training Plan');
    // Concierge nutrition has no separate NutritionSubscription tier to name
    // — it's a bundled benefit, not a purchased plan.
    var nutritionLabel = athlete.nutritionAccessType === 'concierge'
      ? 'Nutrition Guidance'
      : (TIER_DISPLAY[athlete.nutritionTier] || athlete.nutritionTier) + ' Plan';

    var tabs = [];
    if (athlete.planTier) {
      tabTraining.textContent = trainingLabel;
      tabs.push({ btn: tabTraining, content: document.getElementById('trainingTabContent') });
    }
    if (athlete.hasNutritionPlan) {
      tabNutrition.textContent = nutritionLabel;
      tabs.push({ btn: tabNutrition, content: document.getElementById('nutritionSection') });
    }
    if (athlete.macroCalculatorAddon) {
      tabs.push({ btn: tabMacro, content: document.getElementById('macroCalcSection') });
    }

    [tabTraining, tabNutrition, tabMacro].forEach(function (btn) { btn.style.display = 'none'; });
    allContent.forEach(function (el) { el.style.display = 'none'; });

    if (tabs.length <= 1) {
      tabsEl.style.display = 'none';
      // Single-plan client: force that one section visible directly, since
      // no tab click will ever do it. Zero-plan (pending approval etc.):
      // everything stays hidden, matching the prior explicit-hide behavior.
      if (tabs.length === 1) tabs[0].content.style.display = 'block';
      return;
    }

    tabsEl.style.display = 'flex';
    tabs.forEach(function (tab) { tab.btn.style.display = ''; });

    function activate(activeBtn) {
      tabs.forEach(function (tab) {
        var isActive = tab.btn === activeBtn;
        tab.btn.classList.toggle('tp-plan-tab--active', isActive);
        tab.content.style.display = isActive ? 'block' : 'none';
      });
    }

    if (!planTabsBound) {
      planTabsBound = true;
      tabs.forEach(function (tab) {
        tab.btn.addEventListener('click', function () { activate(tab.btn); });
      });
      activate(tabs[0].btn);
    } else {
      // Rerun (e.g. after skipping a workout): don't yank the client back to
      // the first tab if they're currently looking at another one — just
      // make sure whichever tab is already marked active stays visible.
      var currentlyActive = tabs.filter(function (t) { return t.btn.classList.contains('tp-plan-tab--active'); })[0];
      activate((currentlyActive || tabs[0]).btn);
    }
  }

  // ============================================================
  // NUTRITION PLAN (Nutrition Plan tiers only)
  // ============================================================

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadNutritionPlan() {
    try {
      var res = await apiGet('/api/v1/dashboard/nutrition');
      if (!res.success) return;
      if (!res.data) {
        // No plan generated yet — a concierge Private Coaching client who
        // hasn't built their bundled nutrition strategy sees a CTA instead
        // of an empty checklist.
        showNutritionConciergeCTA();
        return;
      }
      renderNutritionPlan(res.data);
    } catch (err) {
      // A nutrition-plan load failure shouldn't break the rest of the dashboard.
    }
  }

  function showNutritionConciergeCTA() {
    var cta = document.getElementById('nutritionConciergeCTA');
    var content = document.getElementById('nutritionPlanContent');
    if (!cta) return;
    cta.style.display = accessTypeAllowsCTA() ? 'block' : 'none';
    if (content) content.style.display = 'none';

    var section = document.getElementById('nutritionSection');
    var tabsEl = document.getElementById('planTabs');
    if (section && (!tabsEl || tabsEl.style.display === 'none' || !tabsEl.style.display)) {
      section.style.display = 'block';
    }
  }

  function accessTypeAllowsCTA() {
    return nutritionAccessType === 'concierge';
  }

  // ============================================================
  // Nutrition Progress (streak, adherence, 14-day trend, check-in state)
  // ============================================================

  var nutritionCompletedIndices = [];
  var nutritionTotalItems = 0;

  async function loadNutritionProgress() {
    try {
      var res = await apiGet('/api/v1/dashboard/nutrition/progress');
      if (!res.success || !res.data) return;
      renderNutritionProgress(res.data);
    } catch (err) {
      // Progress is supplementary — don't break the checklist if it fails.
    }
  }

  function renderNutritionProgress(d) {
    nutritionCompletedIndices = d.todayCompletedIndices || [];
    applyNutritionCheckState();

    document.getElementById('nMetricStreak').textContent = d.streak;

    var pct = d.weekAdherencePct;
    document.getElementById('nMetricAdherence').textContent = pct + '%';
    var circumference = 2 * Math.PI * 20; // r=20
    var offset = circumference - (pct / 100) * circumference;
    var arc = document.getElementById('nAdherenceArc');
    arc.setAttribute('stroke-dashoffset', offset);
    var color = pct >= 80 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171';
    arc.setAttribute('stroke', color);

    renderNutritionTrendChart(d.last14Days);
  }

  function applyNutritionCheckState() {
    var checklistEl = document.getElementById('nutritionChecklist');
    if (!checklistEl) return;
    nutritionCompletedIndices.forEach(function (idx) {
      var item = document.getElementById('nutritionItem' + idx);
      if (item) item.classList.add('checked');
    });
  }

  function renderNutritionTrendChart(days) {
    var container = document.getElementById('nutritionTrendsChart');
    if (!container) return;

    if (!days || !days.length) {
      container.innerHTML = '<div class="tp-trends__empty">No data yet. Check off today\'s meals above to start tracking.</div>';
      return;
    }

    container.innerHTML = '';
    var chart = document.createElement('div');
    chart.className = 'daily-chart';

    days.forEach(function (day) {
      var group = document.createElement('div');
      group.className = 'daily-chart__bar-group';

      var d = new Date(day.date + 'T12:00:00');

      var bar = document.createElement('div');
      bar.className = 'daily-chart__bar';

      if (day.pct != null) {
        bar.style.height = Math.max(8, day.pct) + '%';
        var color = day.pct >= 80 ? '#4ade80' : day.pct >= 50 ? '#fbbf24' : '#f87171';
        bar.style.background = color;
      } else {
        bar.style.height = '15%';
        bar.classList.add('daily-chart__bar--gray');
      }

      var label = document.createElement('div');
      label.className = 'daily-chart__label';
      label.textContent = DAY_NAMES_SHORT[d.getDay()].charAt(0);

      var dateLabel = document.createElement('div');
      dateLabel.className = 'daily-chart__date';
      dateLabel.textContent = d.getDate();

      group.appendChild(bar);
      group.appendChild(label);
      group.appendChild(dateLabel);
      chart.appendChild(group);
    });

    container.appendChild(chart);
  }

  var nutritionRegenBtn = document.getElementById('nutritionRegenBtn');
  if (nutritionRegenBtn) {
    nutritionRegenBtn.addEventListener('click', async function () {
      nutritionRegenBtn.disabled = true;
      var icon = nutritionRegenBtn.querySelector('svg');
      if (icon) icon.classList.add('spinning');

      try {
        var res = await apiPost('/api/v1/dashboard/nutrition/regenerate');
        if (res.success) {
          await loadNutritionPlan();
        }
      } catch (err) {
        // Leave the existing plan showing rather than blanking it on failure.
      } finally {
        nutritionRegenBtn.disabled = false;
        if (icon) icon.classList.remove('spinning');
      }
    });
  }

  function renderNutritionPlan(plan) {
    var section = document.getElementById('nutritionSection');
    if (!section) return;

    var cta = document.getElementById('nutritionConciergeCTA');
    var content = document.getElementById('nutritionPlanContent');
    if (cta) cta.style.display = 'none';
    if (content) content.style.display = 'block';

    // If plan tabs are active, tab-switching owns this section's visibility —
    // don't fight it. Only force it visible for a nutrition-only client with
    // no tabs at all.
    var tabsEl = document.getElementById('planTabs');
    if (!tabsEl || tabsEl.style.display === 'none' || !tabsEl.style.display) {
      section.style.display = 'block';
    }

    document.getElementById('nutritionMacros').innerHTML =
      '<div class="tp-nutrition__macro"><span class="tp-nutrition__macro-value">' + plan.dailyCalories + '</span><span class="tp-nutrition__macro-label">Calories</span></div>' +
      '<div class="tp-nutrition__macro"><span class="tp-nutrition__macro-value">' + plan.proteinG + 'g</span><span class="tp-nutrition__macro-label">Protein</span></div>' +
      '<div class="tp-nutrition__macro"><span class="tp-nutrition__macro-value">' + plan.carbsG + 'g</span><span class="tp-nutrition__macro-label">Carbs</span></div>' +
      '<div class="tp-nutrition__macro"><span class="tp-nutrition__macro-value">' + plan.fatG + 'g</span><span class="tp-nutrition__macro-label">Fat</span></div>';

    document.getElementById('nutritionRhythm').textContent = plan.mealTiming || '';

    var checklist = plan.sampleMeals;
    nutritionChecklistCache = Array.isArray(checklist) ? checklist : [];
    var checklistHtml = '';
    if (Array.isArray(checklist)) {
      checklist.forEach(function (item, idx) {
        checklistHtml += buildNutritionItemHtml(item, idx);
      });
    }
    nutritionTotalItems = Array.isArray(checklist) ? checklist.length : 0;

    var checklistEl = document.getElementById('nutritionChecklist');
    checklistEl.innerHTML = checklistHtml;
    wireNutritionItemEvents(checklistEl);
    applyNutritionCheckState();

    var supplements = (plan.supplementNotes || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    document.getElementById('nutritionSupplements').innerHTML = supplements
      .map(function (s) { return '<span class="tp-nutrition__supplement-chip">' + escapeHtml(s) + '</span>'; })
      .join('');
  }

  var NUTRITION_ICONS = {
    breakfast: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    lunch: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2M7 2v20M17 2v20M17 2a5 5 0 0 0-5 5v6h5"/></svg>',
    dinner: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    snack: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 5V3M9 3h6"/></svg>'
  };

  var nutritionChecklistCache = [];

  function buildNutritionItemHtml(item, idx) {
    var icon = NUTRITION_ICONS[item.type] || NUTRITION_ICONS.snack;
    var foods = Array.isArray(item.foods) ? item.foods : (item.food ? [item.food] : []);
    var foodsHtml = '<ul class="tp-nutrition__item-foods">' +
      foods.map(function (f) { return '<li>' + escapeHtml(f) + '</li>'; }).join('') +
      '</ul>';
    var hasMacros = typeof item.calories === 'number';
    var macrosHtml = hasMacros
      ? '<div class="tp-nutrition__item-macros">' + item.calories + ' cal &nbsp;·&nbsp; ' + item.proteinG + 'g protein &nbsp;·&nbsp; ' + item.carbsG + 'g carbs &nbsp;·&nbsp; ' + item.fatG + 'g fat</div>'
      : '';
    var titleHtml = item.title ? '<div class="tp-nutrition__item-title">' + escapeHtml(item.title) + '</div>' : '';
    var instructionsHtml = '';
    if (item.instructions) {
      instructionsHtml =
        '<button class="tp-nutrition__item-howto-toggle" data-idx="' + idx + '">How to make it</button>' +
        '<div class="tp-nutrition__item-instructions" id="nutritionInstructions' + idx + '" style="display:none;">' + escapeHtml(item.instructions) + '</div>';
    }
    return (
      '<div class="tp-nutrition__item" id="nutritionItem' + idx + '">' +
        '<div class="tp-nutrition__item-icon">' + icon + '</div>' +
        '<div class="tp-nutrition__item-body">' +
          '<div class="tp-nutrition__item-top">' +
            '<span class="tp-nutrition__item-time">' + escapeHtml(item.time || '') + '</span>' +
            '<span class="tp-nutrition__item-label">' + escapeHtml(item.label || '') + '</span>' +
          '</div>' +
          titleHtml +
          foodsHtml +
          macrosHtml +
          instructionsHtml +
          '<div class="tp-nutrition__item-swap-row">' +
            '<button class="tp-nutrition__item-shuffle" data-idx="' + idx + '" title="Not craving this? Shuffle for a new meal idea.">' +
              '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>' +
              '<span>Shuffle</span>' +
            '</button>' +
            '<button class="tp-nutrition__item-ideas" data-idx="' + idx + '" title="Search meal ideas within a calorie cap">' +
              '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
              '<span>Meal Ideas</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<button class="tp-nutrition__item-check" data-idx="' + idx + '" title="Mark done">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</button>' +
      '</div>'
    );
  }

  function wireNutritionItemEvents(checklistEl) {
    checklistEl.querySelectorAll('.tp-nutrition__item-check').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var item = document.getElementById('nutritionItem' + idx);
        var isChecked = item.classList.toggle('checked');
        if (isChecked) {
          if (nutritionCompletedIndices.indexOf(idx) === -1) nutritionCompletedIndices.push(idx);
        } else {
          nutritionCompletedIndices = nutritionCompletedIndices.filter(function (i) { return i !== idx; });
        }
        apiPost('/api/v1/dashboard/nutrition/checkin', {
          completedIndices: nutritionCompletedIndices,
          totalItems: nutritionTotalItems
        }).then(function () {
          return loadNutritionProgress();
        }).catch(function () {
          // Non-critical — the checkbox already reflects the click locally.
        });
      });
    });
    checklistEl.querySelectorAll('.tp-nutrition__item-howto-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = document.getElementById('nutritionInstructions' + btn.getAttribute('data-idx'));
        var isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        btn.textContent = isOpen ? 'How to make it' : 'Hide instructions';
      });
    });
    checklistEl.querySelectorAll('.tp-nutrition__item-shuffle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        shuffleMealAtIndex(parseInt(btn.getAttribute('data-idx'), 10), btn);
      });
    });
    checklistEl.querySelectorAll('.tp-nutrition__item-ideas').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openMealIdeasModal(parseInt(btn.getAttribute('data-idx'), 10));
      });
    });
  }

  function replaceNutritionItemInPlace(idx, item) {
    nutritionChecklistCache[idx] = item;
    var existing = document.getElementById('nutritionItem' + idx);
    if (!existing) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildNutritionItemHtml(item, idx);
    var replacement = wrapper.firstElementChild;
    existing.replaceWith(replacement);
    wireNutritionItemEvents(replacement.parentElement || document.getElementById('nutritionChecklist'));
    applyNutritionCheckState();
  }

  // ============================================================
  // Meal Shuffle — "not craving this? shuffle for a new meal idea."
  // ============================================================

  async function shuffleMealAtIndex(idx, btn) {
    if (btn) {
      btn.disabled = true;
      btn.classList.add('tp-nutrition__item-shuffle--busy');
    }
    try {
      var res = await apiPost('/api/v1/dashboard/nutrition/shuffle-meal', { index: idx });
      if (res.success && res.data && res.data.item) {
        replaceNutritionItemInPlace(idx, res.data.item);
      }
    } catch (err) {
      // Leave the existing meal showing rather than blanking it on failure.
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('tp-nutrition__item-shuffle--busy');
      }
    }
  }

  // ============================================================
  // Meal Ideas — search calorie-capped alternatives for one slot, pick one to apply.
  // ============================================================

  var mealIdeasIndex = null;

  function openMealIdeasModal(idx) {
    mealIdeasIndex = idx;
    document.getElementById('mealIdeasError').style.display = 'none';
    document.getElementById('mealIdeasResults').innerHTML = '';
    document.getElementById('mealIdeasProtein').value = '';
    document.getElementById('mealIdeasCarbs').value = '';
    document.getElementById('mealIdeasFat').value = '';
    document.getElementById('mealIdeasModalOverlay').style.display = 'flex';
    lockBodyScroll();
  }

  function closeMealIdeasModal() {
    mealIdeasIndex = null;
    document.getElementById('mealIdeasModalOverlay').style.display = 'none';
    unlockBodyScroll();
  }

  var mealIdeasModalCloseBtn = document.getElementById('mealIdeasModalClose');
  if (mealIdeasModalCloseBtn) mealIdeasModalCloseBtn.addEventListener('click', closeMealIdeasModal);
  var mealIdeasModalOverlay = document.getElementById('mealIdeasModalOverlay');
  if (mealIdeasModalOverlay) {
    mealIdeasModalOverlay.addEventListener('click', function (e) {
      if (e.target === this) closeMealIdeasModal();
    });
  }

  function renderMealIdeaCandidate(candidate, idx) {
    var foods = Array.isArray(candidate.foods) ? candidate.foods : [];
    return (
      '<div class="meal-idea-card">' +
        '<div class="meal-idea-card__title">' + escapeHtml(candidate.title || 'Meal Idea') + '</div>' +
        '<ul class="tp-nutrition__item-foods">' + foods.map(function (f) { return '<li>' + escapeHtml(f) + '</li>'; }).join('') + '</ul>' +
        '<div class="tp-nutrition__item-macros">' + candidate.calories + ' cal &nbsp;·&nbsp; ' + candidate.proteinG + 'g protein &nbsp;·&nbsp; ' + candidate.carbsG + 'g carbs &nbsp;·&nbsp; ' + candidate.fatG + 'g fat</div>' +
        (candidate.instructions ? '<div class="tp-nutrition__item-instructions" style="display:block;margin-top:0.5rem;">' + escapeHtml(candidate.instructions) + '</div>' : '') +
        '<button class="tp-modal__btn tp-modal__btn--confirm meal-idea-card__use" data-cand-idx="' + idx + '" style="width:100%;margin-top:0.75rem;">Use This</button>' +
      '</div>'
    );
  }

  var mealIdeasCandidates = [];

  var mealIdeasSearchBtn = document.getElementById('mealIdeasSearchBtn');
  if (mealIdeasSearchBtn) {
    mealIdeasSearchBtn.addEventListener('click', async function () {
      if (mealIdeasIndex == null) return;
      var btn = this;
      var errorEl = document.getElementById('mealIdeasError');
      var resultsEl = document.getElementById('mealIdeasResults');
      errorEl.style.display = 'none';
      resultsEl.innerHTML = '';

      var calorieCap = parseInt(document.getElementById('mealIdeasCalorieCap').value, 10);
      if (!calorieCap || calorieCap < 100) {
        errorEl.textContent = 'Enter a calorie cap of at least 100.';
        errorEl.style.display = 'block';
        return;
      }
      var proteinRaw = document.getElementById('mealIdeasProtein').value;
      var carbsRaw = document.getElementById('mealIdeasCarbs').value;
      var fatRaw = document.getElementById('mealIdeasFat').value;

      var payload = { index: mealIdeasIndex, calorieCap: calorieCap };
      if (proteinRaw !== '') payload.proteinG = parseFloat(proteinRaw);
      if (carbsRaw !== '') payload.carbsG = parseFloat(carbsRaw);
      if (fatRaw !== '') payload.fatG = parseFloat(fatRaw);

      btn.disabled = true;
      btn.textContent = 'Searching...';

      try {
        var res = await apiPost('/api/v1/dashboard/nutrition/meal-ideas', payload);
        if (res.success && res.data && Array.isArray(res.data.candidates) && res.data.candidates.length) {
          mealIdeasCandidates = res.data.candidates;
          resultsEl.innerHTML = mealIdeasCandidates.map(function (c, i) { return renderMealIdeaCandidate(c, i); }).join('');
          resultsEl.querySelectorAll('.meal-idea-card__use').forEach(function (useBtn) {
            useBtn.addEventListener('click', function () {
              applyMealIdea(parseInt(useBtn.getAttribute('data-cand-idx'), 10), useBtn);
            });
          });
        } else {
          errorEl.textContent = (res && res.error) || 'No meal ideas found under that cap. Try raising it slightly.';
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = (err && err.message) || 'Failed to search meal ideas.';
        errorEl.style.display = 'block';
      }

      btn.disabled = false;
      btn.textContent = 'Search Meal Ideas';
    });
  }

  async function applyMealIdea(candIdx, useBtn) {
    if (mealIdeasIndex == null) return;
    var candidate = mealIdeasCandidates[candIdx];
    if (!candidate) return;

    useBtn.disabled = true;
    useBtn.textContent = 'Applying...';

    try {
      var res = await apiPost('/api/v1/dashboard/nutrition/meal-ideas/apply', {
        index: mealIdeasIndex,
        item: {
          title: candidate.title,
          foods: candidate.foods,
          instructions: candidate.instructions,
          calories: candidate.calories,
          proteinG: candidate.proteinG,
          carbsG: candidate.carbsG,
          fatG: candidate.fatG
        }
      });
      if (res.success && res.data && res.data.item) {
        replaceNutritionItemInPlace(mealIdeasIndex, res.data.item);
        closeMealIdeasModal();
      } else {
        useBtn.disabled = false;
        useBtn.textContent = 'Use This';
      }
    } catch (err) {
      useBtn.disabled = false;
      useBtn.textContent = 'Use This';
    }
  }

  // ============================================================
  // Weekly Grocery List — the plan's sample day scaled to 7 days and
  // household size. Viewable inline in the modal, or downloadable as a
  // plain-text list.
  // ============================================================

  var lastGroceryList = null;

  var nutritionGroceryBtn = document.getElementById('nutritionGroceryBtn');
  if (nutritionGroceryBtn) {
    nutritionGroceryBtn.addEventListener('click', function () {
      document.getElementById('groceryError').style.display = 'none';
      document.getElementById('groceryModalOverlay').style.display = 'flex';
      lockBodyScroll();
      if (!lastGroceryList) generateGroceryList();
    });
  }
  var groceryModalCloseBtn = document.getElementById('groceryModalClose');
  if (groceryModalCloseBtn) {
    groceryModalCloseBtn.addEventListener('click', function () {
      document.getElementById('groceryModalOverlay').style.display = 'none';
      unlockBodyScroll();
    });
  }
  var groceryModalOverlay = document.getElementById('groceryModalOverlay');
  if (groceryModalOverlay) {
    groceryModalOverlay.addEventListener('click', function (e) {
      if (e.target === this) {
        groceryModalOverlay.style.display = 'none';
        unlockBodyScroll();
      }
    });
  }

  async function generateGroceryList() {
    var errorEl = document.getElementById('groceryError');
    var resultsEl = document.getElementById('groceryListResults');
    var downloadBtn = document.getElementById('groceryDownloadBtn');
    var genBtn = document.getElementById('groceryGenerateBtn');
    errorEl.style.display = 'none';
    downloadBtn.style.display = 'none';

    var people = parseInt(document.getElementById('groceryPeople').value, 10) || 1;

    genBtn.disabled = true;
    genBtn.textContent = 'Generating...';
    resultsEl.innerHTML = '<div class="cal-loading-shimmer"></div>';

    try {
      var res = await apiGet('/api/v1/dashboard/nutrition/grocery-list?people=' + encodeURIComponent(people));
      if (res.success && res.data && Array.isArray(res.data.items)) {
        lastGroceryList = res.data;
        if (!res.data.items.length) {
          resultsEl.innerHTML = '<p style="color:var(--gray);font-size:0.85rem;">No items to list yet.</p>';
        } else {
          resultsEl.innerHTML = '<ul class="grocery-list__items">' +
            res.data.items.map(function (item) { return '<li>' + escapeHtml(item.display) + '</li>'; }).join('') +
            '</ul>';
          downloadBtn.style.display = 'block';
        }
      } else {
        resultsEl.innerHTML = '';
        errorEl.textContent = (res && res.error) || 'Failed to generate the grocery list.';
        errorEl.style.display = 'block';
      }
    } catch (err) {
      resultsEl.innerHTML = '';
      errorEl.textContent = (err && err.message) || 'Failed to generate the grocery list.';
      errorEl.style.display = 'block';
    }

    genBtn.disabled = false;
    genBtn.textContent = 'Generate';
  }

  var groceryGenerateBtn = document.getElementById('groceryGenerateBtn');
  if (groceryGenerateBtn) groceryGenerateBtn.addEventListener('click', generateGroceryList);

  var groceryDownloadBtn = document.getElementById('groceryDownloadBtn');
  if (groceryDownloadBtn) {
    groceryDownloadBtn.addEventListener('click', function () {
      if (!lastGroceryList || !lastGroceryList.items.length) return;
      var lines = ['Vintus Performance — Weekly Grocery List', 'For ' + lastGroceryList.people + ' ' + (lastGroceryList.people === 1 ? 'person' : 'people') + ', ' + lastGroceryList.days + ' days', ''];
      lastGroceryList.items.forEach(function (item) { lines.push('- ' + item.display); });
      var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'vintus-grocery-list.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // ============================================================
  // 30-Day Milestone Report
  // ============================================================

  function showMilestoneReport(report) {
    document.getElementById('milestoneModalTitle').textContent = 'Day ' + report.milestoneDay + ' Report';
    document.getElementById('milestoneModalStats').textContent =
      report.completedCount + ' of ' + report.scheduledCount + ' sessions completed (' + Math.round(report.adherenceRate * 100) + '%)';
    document.getElementById('milestoneModalMessage').textContent = report.message;
    document.getElementById('milestoneModalOverlay').style.display = 'flex';
    lockBodyScroll();

    function dismiss() {
      document.getElementById('milestoneModalOverlay').style.display = 'none';
      unlockBodyScroll();
      apiPost('/api/v1/dashboard/milestone/acknowledge', { milestoneDay: report.milestoneDay }).catch(function () {
        // Non-critical — worst case it reappears next visit, which is fine.
      });
      document.getElementById('milestoneModalDismiss').removeEventListener('click', dismiss);
      document.getElementById('milestoneModalClose').removeEventListener('click', dismiss);
    }

    document.getElementById('milestoneModalDismiss').addEventListener('click', dismiss);
    document.getElementById('milestoneModalClose').addEventListener('click', dismiss);
  }

  // ============================================================
  // Metrics Row
  // ============================================================

  function renderMetrics(d) {
    var metricsRow = document.getElementById('metricsRow');
    metricsRow.style.display = 'grid';

    // Streak
    var streak = (d.streak && d.streak.currentStreak) ? d.streak.currentStreak : 0;
    document.getElementById('metricStreak').textContent = streak;

    // Readiness (computed from today's check-in data)
    if (d.today && d.today.readiness) {
      var r = d.today.readiness;
      var readinessVals = [];
      if (r.perceivedEnergy != null) readinessVals.push(r.perceivedEnergy);
      if (r.perceivedSoreness != null) readinessVals.push(11 - r.perceivedSoreness); // invert: high soreness = low readiness
      if (r.perceivedMood != null) readinessVals.push(r.perceivedMood);
      if (r.sleepQualityManual != null) readinessVals.push(r.sleepQualityManual);
      if (readinessVals.length > 0) {
        var readinessAvg = readinessVals.reduce(function(a, b) { return a + b; }, 0) / readinessVals.length;
        document.getElementById('metricReadiness').textContent = Math.round(readinessAvg);
        document.getElementById('nMetricReadiness').textContent = Math.round(readinessAvg);
      } else {
        document.getElementById('metricReadiness').textContent = '--';
        document.getElementById('nMetricReadiness').textContent = '--';
      }
    } else {
      document.getElementById('metricReadiness').textContent = '--';
      document.getElementById('nMetricReadiness').textContent = '--';
    }
  }

  // Update adherence + TSS when week data loads
  function updateWeekMetrics(sessions, adherenceRate) {
    // Adherence ring
    if (adherenceRate != null) {
      var pct = Math.round(adherenceRate * 100);
      document.getElementById('metricAdherence').textContent = pct + '%';
      var circumference = 2 * Math.PI * 20; // r=20
      var offset = circumference - (pct / 100) * circumference;
      var arc = document.getElementById('adherenceArc');
      arc.setAttribute('stroke-dashoffset', offset);
      // Color based on adherence
      var color = pct >= 80 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171';
      arc.setAttribute('stroke', color);
    }

    // TSS
    var plannedTSS = 0;
    var actualTSS = 0;
    sessions.forEach(function(s) {
      if (s.prescribedTSS) plannedTSS += s.prescribedTSS;
      if (s.actualTSS) actualTSS += s.actualTSS;
    });
    if (plannedTSS > 0) {
      document.getElementById('metricTSS').textContent = Math.round(actualTSS);
      document.getElementById('metricTSSSub').textContent = Math.round(actualTSS) + ' / ' + Math.round(plannedTSS);
    } else {
      document.getElementById('metricTSS').textContent = '--';
    }
  }

  // ============================================================
  // Today's Workout Detail Card
  // ============================================================

  function renderTodayWorkout(data) {
    var el = document.getElementById('todayWorkout');

    if (data.today && data.today.workout) {
      todaySession = data.today.workout;
      var s = todaySession;
      var typeBadge = (s.sessionType || '').replace(/_/g, ' ');
      var duration = s.prescribedDuration ? s.prescribedDuration + ' min' : '';
      var tss = s.prescribedTSS ? 'TSS ' + Math.round(s.prescribedTSS) : '';

      var html = '<div class="tp-workout-card">';

      // Header
      html += '<div class="tp-workout-card__header">';
      html += '<div class="tp-workout-card__title">' + escapeHtml(s.title) + '</div>';
      html += '</div>';

      // Meta badges
      html += '<div class="tp-workout-card__meta">';
      if (typeBadge) html += '<span class="tp-workout-card__badge">' + escapeHtml(typeBadge) + '</span>';
      if (duration) html += '<span class="tp-workout-card__badge">' + duration + '</span>';
      if (tss) html += '<span class="tp-workout-card__badge">' + tss + '</span>';
      html += '<span class="tp-workout-card__badge">' + escapeHtml(s.status) + '</span>';
      html += '</div>';

      // Workout content sections (warmup, main, cooldown)
      html += renderWorkoutSections(s);

      // Action buttons
      html += '<div class="tp-workout-card__actions">';
      if (s.status === 'SCHEDULED') {
        html += '<a href="/workout?id=' + s.id + '" class="tp-workout-card__start-btn">' +
          'Start Workout <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</a>';
        html += '<button class="tp-workout-card__skip-btn" id="skipWorkoutBtn">Skip Session</button>';
      } else if (s.status === 'COMPLETED') {
        html += '<span class="tp-workout-card__completed-label">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
          'Completed</span>';
      }
      html += '</div>';
      html += '</div>';

      el.innerHTML = html;

      // Bind skip button
      var skipBtn = document.getElementById('skipWorkoutBtn');
      if (skipBtn) {
        skipBtn.addEventListener('click', function() { openSkipModal(s.id); });
      }
    } else {
      el.innerHTML =
        '<div class="tp-rest-day">' +
          '<div class="tp-rest-day__icon">&#127769;</div>' +
          '<div class="tp-rest-day__text">Rest day. Recovery is part of the process.</div>' +
        '</div>';
    }
  }

  function renderWorkoutSections(session) {
    var html = '';
    var plan = session.content || session.plan || session.prescribedPlan;

    if (!plan) return html;

    // Handle plan as object or JSON string
    var planObj = plan;
    if (typeof plan === 'string') {
      try { planObj = JSON.parse(plan); } catch(e) { return html; }
    }

    if (planObj.warmup && planObj.warmup.length > 0) {
      html += '<div class="tp-workout-card__section">';
      html += '<div class="tp-workout-card__section-label">Warm-up</div>';
      html += renderExerciseList(planObj.warmup);
      html += '</div>';
    }

    if (planObj.main && planObj.main.length > 0) {
      html += '<div class="tp-workout-card__section">';
      html += '<div class="tp-workout-card__section-label">Main</div>';
      html += renderExerciseList(planObj.main);
      html += '</div>';
    }

    if (planObj.cooldown && planObj.cooldown.length > 0) {
      html += '<div class="tp-workout-card__section">';
      html += '<div class="tp-workout-card__section-label">Cool-down</div>';
      html += renderExerciseList(planObj.cooldown);
      html += '</div>';
    }

    // Fallback: if plan is an array of exercises at root level
    if (!planObj.warmup && !planObj.main && !planObj.cooldown && Array.isArray(planObj.exercises)) {
      html += '<div class="tp-workout-card__section">';
      html += '<div class="tp-workout-card__section-label">Exercises</div>';
      html += renderExerciseList(planObj.exercises);
      html += '</div>';
    }

    return html;
  }

  function renderExerciseList(exercises) {
    if (!exercises || !Array.isArray(exercises)) return '';
    var html = '';
    exercises.forEach(function(ex) {
      var name = ex.name || ex.exercise || ex.title || 'Exercise';
      var detail = '';
      if (ex.sets && ex.reps) {
        detail = ex.sets + ' x ' + ex.reps;
        if (ex.weight) detail += ' @ ' + ex.weight;
      } else if (ex.duration) {
        detail = ex.duration;
      } else if (ex.description) {
        detail = ex.description;
      }

      html += '<div class="tp-workout-card__exercise">';
      html += '<span class="tp-workout-card__exercise-name">' + escapeHtml(name) + '</span>';
      if (detail) html += '<span class="tp-workout-card__exercise-detail">' + escapeHtml(detail) + '</span>';
      html += '</div>';

      if (ex.notes) {
        html += '<div class="tp-workout-card__exercise-notes">' + escapeHtml(ex.notes) + '</div>';
      }
    });
    return html;
  }

  // ============================================================
  // Weekly Calendar
  // ============================================================

  // Week navigation
  document.getElementById('weekPrev').addEventListener('click', function() {
    loadWeek(currentWeekOffset - 1);
  });

  document.getElementById('weekNext').addEventListener('click', function() {
    loadWeek(currentWeekOffset + 1);
  });

  async function loadWeek(offset) {
    currentWeekOffset = offset;
    updateWeekLabel(offset);

    try {
      var res = await apiGet('/api/v1/dashboard/week/' + offset);
      weekSessions = (res.success && res.data && res.data.sessions) ? res.data.sessions : [];
      var adherenceRate = (res.success && res.data) ? res.data.adherenceRate : null;
      renderWeekGrid(weekSessions);

      // Update metrics only for current week
      if (offset === 0) {
        updateWeekMetrics(weekSessions, adherenceRate);
        // Adherence text
        var adhEl = document.querySelector('.tp-week__adherence');
        if (adhEl) {
          if (adherenceRate != null && weekSessions.length > 0) {
            adhEl.textContent = Math.round(adherenceRate * 100) + '% adherence this week';
          } else {
            adhEl.textContent = '';
          }
        }
      }
    } catch (err) {
      renderWeekGrid([]);
    }
  }

  function updateWeekLabel(offset) {
    var label = document.getElementById('weekLabel');
    if (offset === 0) {
      label.textContent = 'This Week';
    } else if (offset === -1) {
      label.textContent = 'Last Week';
    } else if (offset === 1) {
      label.textContent = 'Next Week';
    } else {
      var monday = getWeekMonday(offset);
      label.textContent = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' Week';
    }
  }

  function renderWeekGrid(sessions) {
    var grid = document.getElementById('weekGrid');
    grid.innerHTML = '';

    var monday = getWeekMonday(currentWeekOffset);

    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      grid.appendChild(buildWeekCell(d, sessions));
    }

    // Adherence line
    var adhEl = grid.parentElement.querySelector('.tp-week__adherence');
    if (!adhEl) {
      adhEl = document.createElement('div');
      adhEl.className = 'tp-week__adherence';
      grid.parentElement.appendChild(adhEl);
    }
  }

  // Builds one day cell for a given date, matched against whichever
  // sessions array it's given -- shared by the single-week grid and the
  // multi-week full-plan grid so both stay pixel-identical.
  function buildWeekCell(d, sessions) {
    var dateStr = toLocalDateStr(d);
    var todayStr = toLocalDateStr(today);
    var isPast = dateStr < todayStr;
    var isToday = dateStr === todayStr;

    var daySessions = sessions.filter(function (s) {
      return s.scheduledDate && s.scheduledDate.substring(0, 10) === dateStr;
    });

    var cell = document.createElement('div');
    cell.className = 'tp-week__cell' +
      (isToday ? ' tp-week__cell--today' : '') +
      (isPast ? ' tp-week__cell--past' : '');
    cell.setAttribute('data-date', dateStr);

    var isBeforePlanStart = !!planStartDateStr && dateStr < planStartDateStr;
    var statusInfo = getWeekCellStatus(daySessions, isPast && !isBeforePlanStart);
    var typeLabel = '';
    var durationLabel = '';

    if (daySessions.length > 0) {
      var mainSession = daySessions[0];
      var sessionType = (mainSession.sessionType || '').replace(/_/g, ' ');
      typeLabel = SESSION_TYPE_ICONS[mainSession.sessionType] || sessionType.substring(0, 5).toUpperCase();
      if (mainSession.prescribedDuration) {
        durationLabel = mainSession.prescribedDuration + 'm';
      }
    }

    cell.innerHTML =
      '<span class="tp-week__cell-day">' + DAY_LETTERS[d.getDay()] + '</span>' +
      '<span class="tp-week__cell-date">' + d.getDate() + '</span>' +
      (typeLabel ? '<span class="tp-week__cell-type">' + typeLabel + '</span>' : '') +
      (durationLabel ? '<span class="tp-week__cell-duration">' + durationLabel + '</span>' : '') +
      '<span class="tp-week__cell-status tp-week__cell-status--' + statusInfo.cls + '">' + statusInfo.icon + '</span>';

    // Click to expand detail
    (function (clickDateStr, clickSessions, clickIsToday) {
      cell.addEventListener('click', function () {
        handleCellClick(clickDateStr, clickSessions, clickIsToday);
      });
    })(dateStr, daySessions, isToday);

    return cell;
  }

  function getWeekCellStatus(sessions, isPast) {
    if (sessions.length === 0) {
      return { cls: 'rest', icon: '\u2014' };
    }

    var hasCompleted = sessions.some(function (s) { return s.status === 'COMPLETED'; });
    var hasMissed = sessions.some(function (s) { return s.status === 'MISSED'; });
    var hasSkipped = sessions.some(function (s) { return s.status === 'SKIPPED'; });
    var allScheduled = sessions.every(function (s) { return s.status === 'SCHEDULED'; });

    if (hasCompleted) return { cls: 'completed', icon: '\u2713' };
    if (hasMissed) return { cls: 'missed', icon: '\u2717' };
    if (hasSkipped) return { cls: 'skipped', icon: 'S' };
    if (allScheduled && isPast) return { cls: 'missed', icon: '\u2717' };
    return { cls: 'scheduled', icon: '\u2022' };
  }

  async function handleCellClick(dateStr, sessions, isToday) {
    // Remove selected state from all cells
    document.querySelectorAll('.tp-week__cell--selected').forEach(function(el) {
      el.classList.remove('tp-week__cell--selected');
    });
    // Scoped to .tp-week__cell -- the 14-day performance chart's bars also
    // carry a data-date attribute, so an unscoped selector could grab the
    // wrong element if the DOM order ever changes.
    var clickedCell = document.querySelector('.tp-week__cell[data-date="' + dateStr + '"]');
    if (clickedCell) clickedCell.classList.add('tp-week__cell--selected');

    var workoutEl = document.getElementById('todayWorkout');

    // Today always re-renders the authoritative Today's Workout card from
    // already-loaded data, rather than just scrolling to it -- a previous
    // click on a different day overwrites this same element, so scrolling
    // alone would leave that other day's content stuck on screen with no
    // way back except a page refresh.
    if (isToday && currentWeekOffset === 0 && overviewData) {
      renderTodayWorkout(overviewData);
      workoutEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (sessions.length === 0) return;

    var summary = sessions[0];
    var d = new Date(dateStr + 'T12:00:00');
    var dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    // The week summary doesn't carry warmup/main/cooldown content -- show
    // what we already have immediately, then fill in full detail once the
    // real session (with content) has loaded.
    workoutEl.innerHTML = buildDayPreviewCard(summary, dateLabel);
    workoutEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      var res = await apiGet('/api/v1/dashboard/workout/' + summary.id);
      if (res.success && res.data) {
        workoutEl.innerHTML = buildDayPreviewCard(res.data, dateLabel);
      }
    } catch (err) {
      // Keep the badges-only card already shown.
    }
  }

  // Renders a look-ahead/look-back preview for a day other than today.
  // Never offers a Start Workout action -- that's only ever available for
  // today's own session, via renderTodayWorkout.
  function buildDayPreviewCard(s, dateLabel) {
    var typeBadge = (s.sessionType || '').replace(/_/g, ' ');
    var duration = s.prescribedDuration ? s.prescribedDuration + ' min' : '';

    var html = '<div class="tp-workout-card">';
    html += '<div class="tp-workout-card__header">';
    html += '<div class="tp-workout-card__title">' + escapeHtml(s.title || dateLabel) + '</div>';
    html += '</div>';
    html += '<div class="tp-workout-card__meta">';
    html += '<span class="tp-workout-card__badge">' + escapeHtml(dateLabel) + '</span>';
    if (typeBadge) html += '<span class="tp-workout-card__badge">' + escapeHtml(typeBadge) + '</span>';
    if (duration) html += '<span class="tp-workout-card__badge">' + duration + '</span>';
    html += '<span class="tp-workout-card__badge">' + escapeHtml(s.status) + '</span>';
    html += '</div>';
    html += renderWorkoutSections(s);

    if (s.status === 'COMPLETED') {
      html += '<div class="tp-workout-card__actions">' +
        '<span class="tp-workout-card__completed-label">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
        'Completed</span></div>';
    }

    html += '</div>';
    return html;
  }

  // ============================================================
  // Skip Workout Modal
  // ============================================================

  var skipSessionId = null;

  function openSkipModal(sessionId) {
    skipSessionId = sessionId;
    document.getElementById('skipReason').value = '';
    document.getElementById('skipModalOverlay').style.display = 'flex';
    lockBodyScroll();
  }

  function closeSkipModal() {
    skipSessionId = null;
    document.getElementById('skipModalOverlay').style.display = 'none';
    unlockBodyScroll();
  }

  document.getElementById('skipModalClose').addEventListener('click', closeSkipModal);
  document.getElementById('skipModalCancel').addEventListener('click', closeSkipModal);
  document.getElementById('skipModalOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeSkipModal();
  });

  document.getElementById('skipModalConfirm').addEventListener('click', async function() {
    if (!skipSessionId) return;

    var btn = this;
    var reason = document.getElementById('skipReason').value.trim();
    btn.disabled = true;
    btn.textContent = 'Skipping...';

    try {
      var res = await apiPost('/api/v1/workout/' + encodeURIComponent(skipSessionId) + '/skip', {
        reason: reason || 'No reason provided'
      });

      if (res.success) {
        closeSkipModal();
        // Reload dashboard data
        loadOverview();
        loadWeek(currentWeekOffset);
      } else {
        alert('Failed to skip session: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert(err.message || 'Failed to skip session.');
    }

    btn.disabled = false;
    btn.textContent = 'Skip Session';
  });

  // ============================================================
  // Add-Ons — $23 Calorie & Macro Calculator, Training Plan clients only.
  // Purchase redirects to Stripe; the tab/section itself is handled by
  // setupPlanTabs + renderMacroCalculator once the server confirms ownership.
  // ============================================================

  function updateAddonsButtonVisibility(d) {
    var btn = document.getElementById('addonsBtn');
    if (!btn) return;
    var eligible = !!(d && d.athlete && d.athlete.macroCalculatorAddonEligible);
    var alreadyOwns = !!(d && d.athlete && d.athlete.macroCalculatorAddon);
    btn.style.display = (eligible && !alreadyOwns) ? 'inline-flex' : 'none';
  }

  var addonsBtn = document.getElementById('addonsBtn');
  var addonModalOverlay = document.getElementById('addonModalOverlay');
  if (addonsBtn) {
    addonsBtn.addEventListener('click', function () {
      document.getElementById('addonError').style.display = 'none';
      addonModalOverlay.style.display = 'flex';
      lockBodyScroll();
    });
  }
  document.getElementById('addonModalClose').addEventListener('click', function () {
    addonModalOverlay.style.display = 'none';
    unlockBodyScroll();
  });
  addonModalOverlay.addEventListener('click', function (e) {
    if (e.target === this) {
      addonModalOverlay.style.display = 'none';
      unlockBodyScroll();
    }
  });

  document.getElementById('addonBuyMacroCalcBtn').addEventListener('click', async function () {
    var btn = this;
    var errorEl = document.getElementById('addonError');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Redirecting...';

    try {
      var res = await apiPost('/api/v1/checkout/addon/macro-calculator', {
        successUrl: window.location.origin + '/dashboard',
        cancelUrl: window.location.origin + '/dashboard'
      });
      if (res.success && res.data && res.data.url) {
        window.location.href = res.data.url;
      } else {
        errorEl.textContent = (res && res.error) || 'Failed to start checkout.';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Add for $23';
      }
    } catch (err) {
      errorEl.textContent = (err && err.message) || 'Failed to start checkout.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Add for $23';
    }
  });

  function renderMacroCalculator(addon) {
    if (addon.weightLbs) document.getElementById('mcWeight').value = addon.weightLbs;
    if (addon.heightInches) document.getElementById('mcHeight').value = addon.heightInches;
    if (addon.age) document.getElementById('mcAge').value = addon.age;
    if (addon.gender) document.getElementById('mcGender').value = addon.gender;
    if (addon.activityLevel) document.getElementById('mcActivity').value = addon.activityLevel;
    if (addon.goalDirection) document.getElementById('mcGoal').value = addon.goalDirection;

    if (addon.calories) {
      document.getElementById('mcResults').style.display = 'grid';
      document.getElementById('mcResults').innerHTML =
        '<div class="tp-nutrition__macro"><span class="tp-nutrition__macro-value">' + addon.calories + '</span><span class="tp-nutrition__macro-label">Calories</span></div>' +
        '<div class="tp-nutrition__macro"><span class="tp-nutrition__macro-value">' + addon.proteinGrams + 'g</span><span class="tp-nutrition__macro-label">Protein</span></div>' +
        '<div class="tp-nutrition__macro"><span class="tp-nutrition__macro-value">' + addon.carbGrams + 'g</span><span class="tp-nutrition__macro-label">Carbs</span></div>' +
        '<div class="tp-nutrition__macro"><span class="tp-nutrition__macro-value">' + addon.fatGrams + 'g</span><span class="tp-nutrition__macro-label">Fat</span></div>';
    }
  }

  var mcCalculateBtn = document.getElementById('mcCalculateBtn');
  if (mcCalculateBtn) {
    mcCalculateBtn.addEventListener('click', async function () {
      var btn = this;
      var errorEl = document.getElementById('mcError');
      errorEl.style.display = 'none';

      var weightLbs = parseFloat(document.getElementById('mcWeight').value);
      var heightInches = parseInt(document.getElementById('mcHeight').value, 10);
      var age = parseInt(document.getElementById('mcAge').value, 10);
      var gender = document.getElementById('mcGender').value;
      var activityLevel = document.getElementById('mcActivity').value;
      var goalDirection = document.getElementById('mcGoal').value;

      if (!weightLbs || !heightInches || !age) {
        errorEl.textContent = 'Fill in your weight, height, and age.';
        errorEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.querySelector('span').textContent = 'Calculating...';

      try {
        var res = await apiPost('/api/v1/dashboard/addons/macro-calculator/calculate', {
          weightLbs: weightLbs, heightInches: heightInches, age: age,
          gender: gender, activityLevel: activityLevel, goalDirection: goalDirection
        });
        if (res.success && res.data) {
          renderMacroCalculator(res.data);
          if (overviewData && overviewData.athlete) overviewData.athlete.macroCalculatorAddon = res.data;
        } else {
          errorEl.textContent = (res && res.error) || 'Failed to calculate targets.';
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = (err && err.message) || 'Failed to calculate targets.';
        errorEl.style.display = 'block';
      }

      btn.disabled = false;
      btn.querySelector('span').textContent = 'Calculate My Targets';
    });
  }

  // ============================================================
  // Edit My Preferences — adapts to what the client actually has:
  // training/PC clients get rest-days + day-swap (rebuilds the workout
  // plan), nutrition clients get a goal-update (regenerates the nutrition
  // plan), and a Private Coaching + nutrition client sees both since they
  // have both.
  // ============================================================

  var selectedRestDays = [];

  function updatePrefsButtonVisibility(d) {
    var btn = document.getElementById('editPreferencesBtn');
    if (!btn) return;
    var hasTraining = !!(d && d.athlete && d.athlete.planTier);
    var hasNutrition = !!(d && d.athlete && d.athlete.hasNutritionPlan);
    btn.style.display = (hasTraining || hasNutrition) ? 'inline-flex' : 'none';
  }

  function openPrefsModal() {
    var athlete = (overviewData && overviewData.athlete) || {};
    var hasTraining = !!athlete.planTier;
    var hasNutrition = !!athlete.hasNutritionPlan;

    var trainingSection = document.getElementById('prefsTrainingSection');
    var nutritionSection = document.getElementById('prefsNutritionSection');
    trainingSection.style.display = hasTraining ? 'block' : 'none';
    nutritionSection.style.display = hasNutrition ? 'block' : 'none';

    var trainingLabel = document.getElementById('prefsTrainingSectionLabel');
    if (trainingLabel) {
      trainingLabel.textContent = (TIER_DISPLAY[athlete.planTier] || 'Training');
    }

    selectedRestDays = athlete.restDayPreferences || [];
    document.querySelectorAll('.prefs-day').forEach(function (btn) {
      var day = parseInt(btn.getAttribute('data-day'), 10);
      btn.classList.toggle('prefs-day--active', selectedRestDays.indexOf(day) !== -1);
    });
    document.getElementById('prefsSwapDateA').value = '';
    document.getElementById('prefsSwapDateB').value = '';
    document.getElementById('prefsNutritionGoal').value = '';
    document.getElementById('prefsTargetWeight').value = '';
    document.getElementById('prefsError').style.display = 'none';
    document.getElementById('prefsModalOverlay').style.display = 'flex';
    lockBodyScroll();
  }

  function closePrefsModal() {
    document.getElementById('prefsModalOverlay').style.display = 'none';
    unlockBodyScroll();
  }

  var editPrefsBtn = document.getElementById('editPreferencesBtn');
  if (editPrefsBtn) editPrefsBtn.addEventListener('click', openPrefsModal);

  document.getElementById('prefsModalClose').addEventListener('click', closePrefsModal);
  document.getElementById('prefsModalCancel').addEventListener('click', closePrefsModal);
  document.getElementById('prefsModalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closePrefsModal();
  });

  document.querySelectorAll('.prefs-day').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var day = parseInt(this.getAttribute('data-day'), 10);
      var idx = selectedRestDays.indexOf(day);
      if (idx === -1) {
        selectedRestDays.push(day);
      } else {
        selectedRestDays.splice(idx, 1);
      }
      this.classList.toggle('prefs-day--active');
    });
  });

  document.getElementById('prefsModalSave').addEventListener('click', async function () {
    var btn = this;
    var errorEl = document.getElementById('prefsError');
    errorEl.style.display = 'none';

    var trainingVisible = document.getElementById('prefsTrainingSection').style.display !== 'none';
    var nutritionVisible = document.getElementById('prefsNutritionSection').style.display !== 'none';

    var dateA = document.getElementById('prefsSwapDateA').value;
    var dateB = document.getElementById('prefsSwapDateB').value;
    if ((dateA && !dateB) || (!dateA && dateB)) {
      errorEl.textContent = 'Pick both days to swap, or leave both blank.';
      errorEl.style.display = 'block';
      return;
    }

    var nutritionGoal = document.getElementById('prefsNutritionGoal').value.trim();
    var targetWeightRaw = document.getElementById('prefsTargetWeight').value;

    var calls = [];
    if (trainingVisible) {
      var trainingPayload = { restDays: selectedRestDays };
      if (dateA && dateB) {
        trainingPayload.swapDateA = dateA;
        trainingPayload.swapDateB = dateB;
      }
      calls.push({ label: 'training', promise: apiPost('/api/v1/workout/rebuild-preferences', trainingPayload) });
    }
    if (nutritionVisible && nutritionGoal) {
      var nutritionPayload = { goalDescription: nutritionGoal };
      if (targetWeightRaw) nutritionPayload.targetWeight = parseFloat(targetWeightRaw);
      calls.push({ label: 'nutrition', promise: apiPost('/api/v1/dashboard/nutrition/update-goal', nutritionPayload) });
    }

    if (calls.length === 0) {
      errorEl.textContent = 'Nothing to save yet — pick rest days, a swap, or a nutrition goal.';
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    var errors = [];
    for (var i = 0; i < calls.length; i++) {
      try {
        var res = await calls[i].promise;
        if (!res.success) errors.push(res.error || ('Failed to update ' + calls[i].label + ' preferences.'));
      } catch (err) {
        errors.push((err && err.message) || ('Failed to update ' + calls[i].label + ' preferences.'));
      }
    }

    if (errors.length === 0) {
      closePrefsModal();
      await loadOverview();
      await loadWeek(currentWeekOffset);
    } else {
      errorEl.textContent = errors.join(' ');
      errorEl.style.display = 'block';
    }

    btn.disabled = false;
    btn.textContent = 'Save Preferences';
  });

  // ============================================================
  // 14-Day Performance — Clickable Bar Chart + Detail Panel
  // ============================================================

  async function loadTrends() {
    try {
      var res = await apiGet('/api/v1/dashboard/daily-summary?days=14');
      if (!res.success || !res.data) return;

      dailySummaryData = res.data;

      if (!dailySummaryData.days || !dailySummaryData.days.length) {
        document.getElementById('trendsChart').innerHTML =
          '<div class="tp-trends__empty">No data yet. Submit your first check-in above to see your performance.</div>';
        return;
      }

      // Update header score
      var scoreEl = document.getElementById('trendsScore');
      if (dailySummaryData.averageScore != null) {
        var avg = dailySummaryData.averageScore;
        var cls = avg >= 75 ? 'good' : avg >= 50 ? 'moderate' : 'low';
        scoreEl.className = 'tp-trends__score tp-trends__score--' + cls;
        scoreEl.innerHTML = '<strong>' + avg + '</strong> Avg';
      } else {
        scoreEl.textContent = '';
      }

      renderDailyChart(dailySummaryData.days);
    } catch (err) {
      document.getElementById('trendsChart').innerHTML =
        '<div class="tp-trends__empty">Unable to load performance data.</div>';
    }
  }

  function getGradeColor(grade) {
    if (grade === 'green') return '#4ade80';
    if (grade === 'yellow') return '#fbbf24';
    if (grade === 'red') return '#f87171';
    return 'rgba(255,255,255,0.08)';
  }

  function renderDailyChart(days) {
    var container = document.getElementById('trendsChart');
    container.innerHTML = '';

    var chart = document.createElement('div');
    chart.className = 'daily-chart';

    var todayStr = toLocalDateStr(today);

    days.forEach(function (day) {
      var group = document.createElement('div');
      group.className = 'daily-chart__bar-group';
      group.setAttribute('data-date', day.date);

      var d = new Date(day.date + 'T12:00:00');
      var isToday = day.date === todayStr;

      if (isToday) group.classList.add('daily-chart__bar-group--today');

      var bar = document.createElement('div');
      bar.className = 'daily-chart__bar';

      if (day.score != null) {
        bar.style.height = Math.max(8, day.score) + '%';
        bar.style.background = getGradeColor(day.grade);
      } else {
        bar.style.height = '15%';
        bar.classList.add('daily-chart__bar--gray');
      }

      var label = document.createElement('div');
      label.className = 'daily-chart__label';
      label.textContent = DAY_NAMES_SHORT[d.getDay()].charAt(0);

      var dateLabel = document.createElement('div');
      dateLabel.className = 'daily-chart__date';
      dateLabel.textContent = d.getDate();

      group.appendChild(bar);
      group.appendChild(label);
      group.appendChild(dateLabel);

      if (day.dayType !== 'future') {
        group.addEventListener('click', function () {
          if (selectedDate === day.date) {
            closeDailyDetail();
          } else {
            openDailyDetail(day);
            chart.querySelectorAll('.daily-chart__bar-group--active').forEach(function (el) {
              el.classList.remove('daily-chart__bar-group--active');
            });
            group.classList.add('daily-chart__bar-group--active');
          }
        });
      } else {
        group.style.opacity = '0.3';
        group.style.cursor = 'default';
      }

      chart.appendChild(group);
    });

    container.appendChild(chart);

    var detail = document.createElement('div');
    detail.className = 'daily-detail';
    detail.id = 'dailyDetail';
    detail.style.display = 'none';
    container.appendChild(detail);
  }

  function openDailyDetail(day) {
    selectedDate = day.date;
    var panel = document.getElementById('dailyDetail');
    var d = new Date(day.date + 'T12:00:00');
    var dateDisplay = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    var html = '';

    var titleText = dateDisplay;
    if (day.workout) {
      titleText += ' — ' + escapeHtml(day.workout.title);
    } else if (day.dayType === 'rest') {
      titleText += ' — Rest Day';
    } else if (day.dayType === 'no_data') {
      titleText += ' — No Data';
    }

    var gradeBadge = '';
    if (day.score != null) {
      gradeBadge = '<span class="daily-detail__grade daily-detail__grade--' + day.grade + '">' + day.score + '</span>';
    }

    html += '<div class="daily-detail__header">' +
      '<div class="daily-detail__title">' + titleText + gradeBadge + '</div>' +
      '<button class="daily-detail__close" id="detailClose">&times;</button>' +
    '</div>';

    if (day.dayType === 'missed' || day.dayType === 'skipped') {
      var statusLabel = day.dayType === 'skipped' ? 'Skipped' : 'Missed';
      var statusMsg = '';
      if (day.readiness) {
        if (day.readiness.readinessAvg < 4) {
          statusMsg = day.dayType === 'skipped'
            ? 'Readiness was low (' + day.readiness.readinessAvg.toFixed(1) + '/10). Smart decision.'
            : 'Readiness was low (' + day.readiness.readinessAvg.toFixed(1) + '/10). Your body needed rest.';
        } else if (day.readiness.readinessAvg < 6) {
          statusMsg = statusLabel + '. Readiness was moderate (' + day.readiness.readinessAvg.toFixed(1) + '/10).';
        } else {
          statusMsg = statusLabel + '. Readiness was good (' + day.readiness.readinessAvg.toFixed(1) + '/10) — you had the capacity.';
        }
      } else {
        statusMsg = statusLabel + '. No check-in data for this day.';
      }
      html += '<div class="daily-detail__status daily-detail__status--' + day.dayType + '">' +
        '<strong>' + statusLabel + '</strong> ' + statusMsg +
      '</div>';
    }

    if (day.isDeloadWeek) {
      html += '<div class="daily-detail__deload-badge">Deload Week</div>';
    }

    if (day.breakdown && day.dayType === 'workout' && day.workout && day.workout.status === 'COMPLETED') {
      html += '<div class="daily-detail__section">';
      html += '<div class="daily-detail__section-title">Score Breakdown</div>';

      if (day.breakdown.durationAdherence != null) {
        var durText = '';
        if (day.workout.actualDuration && day.workout.prescribedDuration) {
          durText = day.workout.actualDuration + '/' + day.workout.prescribedDuration + ' min';
        }
        html += buildBreakdownRow('Duration', day.breakdown.durationAdherence, durText);
      }
      if (day.breakdown.tssAdherence != null) {
        var tssText = '';
        if (day.workout.actualTSS && day.workout.prescribedTSS) {
          tssText = Math.round(day.workout.actualTSS) + '/' + Math.round(day.workout.prescribedTSS) + ' TSS';
        }
        html += buildBreakdownRow('Intensity', day.breakdown.tssAdherence, tssText);
      }
      if (day.breakdown.rpeAppropriateness != null) {
        html += buildBreakdownRow('Effort (RPE ' + day.workout.rpe + ')', day.breakdown.rpeAppropriateness, '');
      }
      if (day.breakdown.readinessQuality != null) {
        html += buildBreakdownRow('Readiness', day.breakdown.readinessQuality, '');
      }

      html += '</div>';
    }

    if (day.readiness) {
      html += '<div class="daily-detail__section">';
      html += '<div class="daily-detail__section-title">Check-in Data</div>';
      html += '<div class="daily-detail__readiness">';
      html += buildReadinessItem('Energy', day.readiness.perceivedEnergy);
      html += buildReadinessItem('Soreness', day.readiness.perceivedSoreness);
      html += buildReadinessItem('Mood', day.readiness.perceivedMood);
      html += buildReadinessItem('Sleep', day.readiness.sleepQualityManual);
      html += '</div>';
      html += '</div>';
    }

    if (day.hasWearableData && day.readiness) {
      html += '<div class="daily-detail__section">';
      html += '<div class="daily-detail__section-title">Device Data</div>';
      html += '<div class="daily-detail__readiness">';
      if (day.readiness.hrvMs != null) html += buildReadinessItem('HRV', day.readiness.hrvMs + 'ms');
      if (day.readiness.restingHr != null) html += buildReadinessItem('RHR', day.readiness.restingHr + 'bpm');
      if (day.readiness.sleepScore != null) html += buildReadinessItem('Sleep Score', Math.round(day.readiness.sleepScore));
      if (day.readiness.sleepDurationMin != null) html += buildReadinessItem('Sleep', Math.round(day.readiness.sleepDurationMin / 60 * 10) / 10 + 'h');
      if (day.readiness.steps != null) html += buildReadinessItem('Steps', day.readiness.steps.toLocaleString());
      html += '</div>';
      html += '</div>';
    } else if (dailySummaryData && dailySummaryData.connectedDevices && dailySummaryData.connectedDevices.length === 0) {
      html += '<div class="daily-detail__section">';
      html += '<div class="daily-detail__device-prompt">' +
        'Connect a wearable to see HRV, sleep, and recovery metrics. <a href="/onboarding">Setup</a>' +
      '</div>';
      html += '</div>';
    }

    if (day.workout && day.workout.athleteNotes) {
      html += '<div class="daily-detail__section">';
      html += '<div class="daily-detail__section-title">Notes</div>';
      html += '<div class="daily-detail__notes">' + escapeHtml(day.workout.athleteNotes) + '</div>';
      html += '</div>';
    }

    if (day.dayType === 'no_data') {
      html += '<div class="daily-detail__empty">' +
        'No check-in or workout data for this day. Regular check-ins help personalize your plan.' +
      '</div>';
    }

    panel.innerHTML = html;
    panel.style.display = 'block';

    document.getElementById('detailClose').addEventListener('click', function () {
      closeDailyDetail();
    });
  }

  function closeDailyDetail() {
    selectedDate = null;
    var panel = document.getElementById('dailyDetail');
    if (panel) panel.style.display = 'none';
    document.querySelectorAll('.daily-chart__bar-group--active').forEach(function (el) {
      el.classList.remove('daily-chart__bar-group--active');
    });
  }

  function buildBreakdownRow(label, score, subtext) {
    var color = score >= 75 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171';
    return '<div class="daily-detail__breakdown-row">' +
      '<span class="daily-detail__breakdown-label">' + label + '</span>' +
      '<div class="daily-detail__breakdown-bar"><div class="daily-detail__breakdown-fill" style="width:' + score + '%;background:' + color + ';"></div></div>' +
      '<span class="daily-detail__breakdown-value">' + score + '</span>' +
      (subtext ? '<span class="daily-detail__breakdown-sub">' + subtext + '</span>' : '') +
    '</div>';
  }

  function buildReadinessItem(label, value) {
    return '<div class="daily-detail__readiness-item">' +
      '<span class="daily-detail__readiness-value">' + value + '</span>' +
      '<span class="daily-detail__readiness-label">' + label + '</span>' +
    '</div>';
  }

  // ============================================================
  // Check-in Submission
  // ============================================================

  var checkinBtn = document.getElementById('checkinBtn');
  checkinBtn.addEventListener('click', async function () {
    checkinBtn.disabled = true;
    checkinBtn.textContent = 'Submitting...';

    var payload = {
      perceivedEnergy: parseInt(document.getElementById('ciEnergy').value, 10),
      perceivedSoreness: parseInt(document.getElementById('ciSoreness').value, 10),
      perceivedMood: parseInt(document.getElementById('ciMood').value, 10),
      sleepQualityManual: parseInt(document.getElementById('ciSleep').value, 10)
    };

    try {
      var res = await apiPost('/api/v1/readiness/checkin', payload);
      if (res.success) {
        var successEl = document.getElementById('checkinSuccess');
        successEl.classList.add('show');
        setTimeout(function () { successEl.classList.remove('show'); }, 4000);
        checkinBtn.textContent = 'Submitted';
        loadTrends();
      } else {
        alert('Check-in failed. Please try again.');
        checkinBtn.disabled = false;
        checkinBtn.textContent = 'Submit Check-in';
      }
    } catch (err) {
      alert(err.message || 'Check-in failed.');
      checkinBtn.disabled = false;
      checkinBtn.textContent = 'Submit Check-in';
    }
  });

  // ============================================================
  // Manage Subscription
  // ============================================================

  var manageSubBtn = document.getElementById('manageSubBtn');
  manageSubBtn.addEventListener('click', async function () {
    if (currentTier && currentTier !== 'PRIVATE_COACHING') {
      alert('Your ' + (TIER_DISPLAY[currentTier] || currentTier) + ' plan does not have a recurring subscription to manage. Contact support@vintusperformance.org for assistance.');
      return;
    }
    manageSubBtn.querySelector('span').textContent = 'Loading...';
    try {
      var res = await apiPost('/api/v1/checkout/portal');
      if (res.success && res.data && res.data.url) {
        window.location.href = res.data.url;
      } else {
        alert('Unable to open subscription portal.');
        manageSubBtn.querySelector('span').textContent = 'Billing';
      }
    } catch (err) {
      alert(err.message || 'Unable to open portal.');
      manageSubBtn.querySelector('span').textContent = 'Billing';
    }
  });

  // ============================================================
  // Logout
  // ============================================================

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    try {
      await apiPost('/api/v1/auth/logout');
    } catch (e) {
      // Clear local state regardless
    }
    clearToken();
    localStorage.removeItem('vintus_role');
    window.location.href = '/login';
  });

  // ============================================================
  // Utility
  // ============================================================

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================
  // Coach Chat — Slide-Out Panel
  // ============================================================

  var chatPanel = document.getElementById('chatPanel');
  var chatOverlay = document.getElementById('chatOverlay');
  var chatMessages = document.getElementById('chatMessages');
  var chatInput = document.getElementById('chatInput');
  var chatForm = document.getElementById('chatForm');
  var chatSendBtn = document.getElementById('chatSendBtn');
  var chatTyping = document.getElementById('chatTyping');
  var chatOpenBtn = document.getElementById('chatOpenBtn');
  var chatCloseBtn = document.getElementById('chatCloseBtn');
  var chatHistoryLoaded = false;
  var chatSending = false;

  function openChat() {
    chatPanel.classList.add('open');
    chatOverlay.classList.add('open');
    lockBodyScroll();

    if (!chatHistoryLoaded) {
      loadChatHistory();
    }

    setTimeout(function() { chatInput.focus(); }, 350);
  }

  function closeChat() {
    chatPanel.classList.remove('open');
    chatOverlay.classList.remove('open');
    unlockBodyScroll();
  }

  chatOpenBtn.addEventListener('click', openChat);
  chatCloseBtn.addEventListener('click', closeChat);
  chatOverlay.addEventListener('click', closeChat);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && chatPanel.classList.contains('open')) {
      closeChat();
    }
  });

  async function loadChatHistory() {
    try {
      var res = await apiGet('/api/v1/chat/history');
      chatHistoryLoaded = true;

      if (res.success && res.data && res.data.messages && res.data.messages.length > 0) {
        chatMessages.innerHTML = '';
        res.data.messages.forEach(function(msg) {
          appendBubble(msg.role, msg.content, msg.createdAt, msg.action);
        });
        scrollChatToBottom();
      } else {
        renderChatWelcome();
      }
    } catch (err) {
      chatHistoryLoaded = true;
      renderChatWelcome();
    }
  }

  function renderChatWelcome() {
    chatMessages.innerHTML =
      '<div class="chat-welcome">' +
        '<div class="chat-welcome-title">Coach Jerry</div>' +
        '<div class="chat-welcome-text">Ask me anything about your training, recovery, or how to adjust your plan.</div>' +
        '<div class="chat-welcome-suggestions">' +
          '<button class="chat-suggestion-chip" data-msg="How should I approach today\'s workout?">How should I approach today\'s workout?</button>' +
          '<button class="chat-suggestion-chip" data-msg="I\'m feeling sore today. Should I modify anything?">I\'m feeling sore. Should I modify anything?</button>' +
          '<button class="chat-suggestion-chip" data-msg="Can you explain my current training block?">Explain my current training block</button>' +
        '</div>' +
      '</div>';

    chatMessages.querySelectorAll('.chat-suggestion-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var msg = this.getAttribute('data-msg');
        chatInput.value = msg;
        chatSendBtn.disabled = false;
        handleChatSend();
      });
    });
  }

  chatInput.addEventListener('input', function() {
    chatSendBtn.disabled = !this.value.trim();
  });

  chatForm.addEventListener('submit', function(e) {
    e.preventDefault();
    handleChatSend();
  });

  async function handleChatSend() {
    var messageText = chatInput.value.trim();
    if (!messageText || chatSending) return;

    chatSending = true;
    chatInput.value = '';
    chatSendBtn.disabled = true;

    var welcome = chatMessages.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    appendBubble('user', messageText, new Date().toISOString());
    scrollChatToBottom();

    var readDelay = 200 + Math.random() * 200;
    var typingShown = false;

    var typingTimer = setTimeout(function() {
      showChatTyping();
      scrollChatToBottom();
      typingShown = true;
    }, readDelay);

    var sendStart = Date.now();
    try {
      var res = await apiPost('/api/v1/chat/send', { message: messageText });

      if (res.success && res.data && res.data.assistantMessage) {
        var responseText = res.data.assistantMessage.content;
        var responseTime = res.data.assistantMessage.createdAt;
        var apiElapsed = Date.now() - sendStart;

        var baseDelay = 1500;
        var perCharDelay = 15;
        var charCount = responseText.length;
        var typingDuration = Math.min(4000, Math.max(1500, baseDelay + (charCount * perCharDelay)));
        typingDuration += (Math.random() - 0.5) * 600;

        var remainingDelay = Math.max(400, typingDuration - apiElapsed);

        if (!typingShown) {
          clearTimeout(typingTimer);
          showChatTyping();
          scrollChatToBottom();
        }

        await chatSleep(remainingDelay);

        hideChatTyping();
        appendBubble('assistant', responseText, responseTime, res.data.assistantMessage.action);
        scrollChatToBottom();
      } else {
        clearTimeout(typingTimer);
        hideChatTyping();
        appendBubble('assistant', 'Something went wrong. Try sending that again.', new Date().toISOString());
        scrollChatToBottom();
      }
    } catch (err) {
      clearTimeout(typingTimer);
      if (typingShown) {
        await chatSleep(600);
      }
      hideChatTyping();

      var errorMsg = (err && err.status === 429)
        ? "Let's pace this a bit. Try again in a few minutes."
        : 'Connection issue. Try again in a moment.';

      appendBubble('assistant', errorMsg, new Date().toISOString());
      scrollChatToBottom();
    }

    chatSending = false;
    chatInput.focus();
  }

  function chatSleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function appendBubble(role, content, timestamp, action) {
    var wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble chat-bubble--' + role;

    var escapedContent = escapeHtml(content);
    var formattedContent = escapedContent.replace(/\n/g, '<br>');

    wrapper.innerHTML = formattedContent +
      (action ? '<div class="chat-bubble-action">Updated: ' + escapeHtml(action) + '</div>' : '') +
      '<div class="chat-bubble-time">' + formatChatTime(timestamp) + '</div>';

    chatMessages.appendChild(wrapper);
  }

  function formatChatTime(isoString) {
    var d = new Date(isoString);
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function showChatTyping() {
    chatTyping.style.display = 'flex';
  }

  function hideChatTyping() {
    chatTyping.style.display = 'none';
  }

  function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

})();
