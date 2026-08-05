/**
 * Vintus Performance — Plan Preview
 * Reads ?tier=X from the URL, renders a tier-specific cover + blurred
 * sample preview, and carries the tier intent into the assessment via
 * localStorage so results.html can auto-highlight it later.
 */

(function () {
  var TIER_CONTENT = {
    TRAINING_30DAY: {
      category: 'Training Plan',
      title: '30-Day Training Plan',
      tagline: 'A focused sprint to kickstart your transformation. Perfect for building habits and seeing initial results.',
      price: '$99',
      period: 'one-time',
      badge: null,
      sample: [
        { title: 'Week 1 — Day 1: Full Body Strength', detail: 'Back Squat 4x6 · Bench Press 4x8 · Row 3x10' },
        { title: 'Week 1 — Day 2: Conditioning', detail: 'Interval work · Mobility circuit · Core finisher' },
        { title: 'Week 2 — Day 1: Progressive Overload', detail: 'Load increase · Tempo adjustments · RPE targets' }
      ]
    },
    TRAINING_60DAY: {
      category: 'Training Plan',
      title: '60-Day Training Plan',
      tagline: 'Build momentum and establish lasting routines with progressive overload phases.',
      price: '$149',
      period: 'one-time',
      badge: 'Popular',
      sample: [
        { title: 'Phase 1 — Foundation: Day 1', detail: 'Compound lifts · Movement quality · Base volume' },
        { title: 'Phase 2 — Build: Day 1', detail: 'Increased intensity · Accessory work · Conditioning blocks' },
        { title: 'Phase 2 — Build: Day 3', detail: 'Upper/lower split · Progressive loading · Recovery cues' }
      ]
    },
    TRAINING_90DAY: {
      category: 'Training Plan',
      title: '90-Day Training Plan',
      tagline: 'The complete transformation. Full periodization for optimal, lasting results.',
      price: '$199',
      period: 'one-time',
      badge: null,
      sample: [
        { title: 'Phase 1 — Base: Day 1', detail: 'Movement foundation · Volume accumulation' },
        { title: 'Phase 2 — Build: Day 1', detail: 'Strength emphasis · Progressive overload' },
        { title: 'Phase 3 — Peak: Day 1', detail: 'Peak intensity · Deload-timed recovery' }
      ]
    },
    NUTRITION_4WEEK: {
      category: 'Nutrition Plan',
      title: '4-Week Nutrition Plan',
      tagline: 'Perfect for a focused nutrition reset or learning proper fueling fundamentals.',
      price: '$229',
      period: 'one-time',
      badge: null,
      sample: [
        { title: 'Week 1 — Daily Macro Targets', detail: 'Protein · Carbs · Fats calculated to your body & goals' },
        { title: 'Week 1 — Meal Timing', detail: 'Pre/post-training windows · Hydration targets' },
        { title: 'Week 2 — Adjustments', detail: 'Progress-based recalibration · Supplement notes' }
      ]
    },
    NUTRITION_8WEEK: {
      category: 'Nutrition Plan',
      title: '8-Week Nutrition Plan',
      tagline: 'Complete nutrition transformation with AI-powered customization for your exact needs.',
      price: '$399',
      period: 'one-time',
      badge: null,
      sample: [
        { title: 'Phase 1 — Reset: Week 1', detail: 'Baseline macros · Habit-building structure' },
        { title: 'Phase 2 — Optimize: Week 3', detail: 'Refined targets · Performance-timed fueling' },
        { title: 'Phase 3 — Sustain: Week 6', detail: 'Long-term maintenance · Flexible framework' }
      ]
    }
  };

  var params = new URLSearchParams(window.location.search);
  var tier = params.get('tier');
  var content = TIER_CONTENT[tier];

  if (!content) {
    // Unknown or missing tier — send back to the services page rather than
    // showing a broken/empty preview.
    window.location.href = '/features';
    return;
  }

  document.getElementById('pvCategoryLabel').textContent = content.category;
  document.getElementById('pvTitle').textContent = content.title;
  document.getElementById('pvTagline').textContent = content.tagline;
  document.getElementById('pvPrice').textContent = content.price;
  document.getElementById('pvPeriod').textContent = content.period;
  document.title = content.title + ' | Vintus Performance';

  if (content.badge) {
    var badgeEl = document.getElementById('pvBadge');
    badgeEl.textContent = content.badge;
    badgeEl.style.display = 'inline-block';
  }

  var cardsEl = document.getElementById('pvPreviewCards');
  content.sample.forEach(function (item) {
    var card = document.createElement('div');
    card.className = 'pv-sample-card';
    card.innerHTML = '<div class="pv-sample-title">' + escapeHtml(item.title) + '</div>' +
      '<div class="pv-sample-detail">' + escapeHtml(item.detail) + '</div>';
    cardsEl.appendChild(card);
  });

  // Carry the tier intent into the assessment so results.html can
  // auto-highlight the plan the visitor actually came here for.
  localStorage.setItem('vintus_selected_tier', tier);

  var assessmentUrl = '/assessment?tier=' + encodeURIComponent(tier);
  var unlockBtn = document.getElementById('pvUnlockBtn');
  var unlockBtnBottom = document.getElementById('pvUnlockBtnBottom');
  unlockBtn.href = assessmentUrl;
  unlockBtnBottom.href = assessmentUrl;

  // An already-logged-in client adding a Nutrition Plan on top of an
  // existing plan doesn't need the full new-client assessment — they're
  // already onboarded. Send them straight to checkout, then a short
  // nutrition-only intake instead of the whole survey.
  var isNutritionTier = tier.indexOf('NUTRITION') === 0;
  if (isNutritionTier && typeof isLoggedIn === 'function' && isLoggedIn()) {
    [unlockBtn, unlockBtnBottom].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        buyNutritionDirect(btn, tier);
      });
    });
  }

  async function buyNutritionDirect(btn, tier) {
    var originalText = btn.textContent;
    btn.textContent = 'Redirecting to checkout...';
    try {
      var res = await apiPost('/api/v1/checkout/session', {
        tier: tier,
        successUrl: window.location.origin + '/nutrition-intake',
        cancelUrl: window.location.origin + '/plan-preview?tier=' + encodeURIComponent(tier)
      });
      if (res.data && res.data.url) {
        window.location.href = res.data.url;
      } else {
        btn.textContent = originalText;
        window.location.href = assessmentUrl;
      }
    } catch (err) {
      // Fall back to the normal assessment path rather than leaving the
      // client stuck on a dead button.
      btn.textContent = originalText;
      window.location.href = assessmentUrl;
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
