/**
 * Vintus Performance — Add-on Nutrition Plan Intake
 * For an existing, already-authenticated client who just bought a
 * Nutrition Plan (via Settings) on top of their current plan. No password
 * step — they're already logged in. Submits straight to
 * POST /api/v1/onboarding/nutrition-intake, then shows a success state.
 */

(function () {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  var errorEl = document.getElementById('onboardError');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function hideError() {
    errorEl.style.display = 'none';
  }

  function goToStep(step) {
    document.querySelectorAll('.onboard-step').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-step') === String(step));
    });
  }

  // Pre-fill anything already known from a prior plan's onboarding, so a
  // returning client isn't asked for data Vintus already has.
  (async function prefill() {
    try {
      var res = await apiGet('/api/v1/auth/me');
      var profile = (res.data && res.data.user && res.data.user.athleteProfile) || {};
      if (profile.gender) document.getElementById('gender').value = profile.gender;
      if (profile.heightInches) {
        document.getElementById('heightFt').value = Math.floor(profile.heightInches / 12);
        document.getElementById('heightIn').value = profile.heightInches % 12;
      }
      if (profile.weightLbs) document.getElementById('weightLbs').value = profile.weightLbs;
      if (profile.dietaryApproach) document.getElementById('dietaryApproach').value = profile.dietaryApproach;
    } catch (err) {
      // Non-fatal — the form just starts blank if this fails.
    }
  })();

  function optVal(id) { var v = document.getElementById(id).value; return v || undefined; }
  function optText(id) { var v = document.getElementById(id).value.trim(); return v || undefined; }
  function optFloat(id) { var v = document.getElementById(id).value; return v ? parseFloat(v) : undefined; }
  function optInt(id) { var v = document.getElementById(id).value; return v ? parseInt(v, 10) : undefined; }

  var submitBtn = document.getElementById('nutritionIntakeBtn');
  submitBtn.addEventListener('click', async function () {
    hideError();

    var heightFt = document.getElementById('heightFt').value;
    var heightIn = document.getElementById('heightIn').value;
    var heightInches = (heightFt && heightIn !== '') ? (parseInt(heightFt, 10) * 12 + parseInt(heightIn, 10)) : undefined;

    var payload = {
      gender: optVal('gender'),
      heightInches: heightInches,
      weightLbs: optFloat('weightLbs'),
      mealsPerDay: optInt('mealsPerDay'),
      dietaryApproach: optVal('dietaryApproach'),
      activityLevel: optVal('activityLevel'),
      nutritionGoals: optText('nutritionGoals'),
      foodAllergies: optText('foodAllergies'),
      foodsLoved: optText('foodsLoved'),
      foodsHated: optText('foodsHated'),
      cookingSkill: optVal('cookingSkill'),
      mealPrepTime: optVal('mealPrepTime'),
      foodBudget: optVal('foodBudget'),
      chronicConditions: optText('chronicConditions'),
      medications: optText('medications')
    };

    Object.keys(payload).forEach(function (k) {
      if (payload[k] === undefined) delete payload[k];
    });

    submitBtn.disabled = true;
    submitBtn.textContent = 'Building your plan...';

    try {
      var res = await apiPost('/api/v1/onboarding/nutrition-intake', payload);
      if (res.success) {
        goToStep(2);
      } else {
        showError('Failed to build your nutrition plan. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Build My Nutrition Plan';
      }
    } catch (err) {
      showError(err.message || 'Something went wrong.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Build My Nutrition Plan';
    }
  });
})();
