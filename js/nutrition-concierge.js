/**
 * Vintus Performance — Concierge Nutrition Strategy Intake
 * For an active Private Coaching client using their bundled nutrition
 * benefit for the first time. Short, goals-focused — physical stats
 * (gender/height/weight/meals-per-day) are pulled silently from the
 * profile they already gave during onboarding, not re-asked here.
 * Submits to POST /api/v1/onboarding/nutrition-intake, then shows a
 * success state.
 */

(function () {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  var errorEl = document.getElementById('onboardError');
  var carriedProfile = {};

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

  // Pull physical stats already on file from onboarding — never re-ask a
  // Private Coaching client for data Vintus already has.
  (async function loadCarriedProfile() {
    try {
      var res = await apiGet('/api/v1/auth/me');
      var profile = (res.data && res.data.user && res.data.user.athleteProfile) || {};
      if (profile.gender) carriedProfile.gender = profile.gender;
      if (profile.heightInches) carriedProfile.heightInches = profile.heightInches;
      if (profile.weightLbs) carriedProfile.weightLbs = profile.weightLbs;
      if (profile.mealsPerDay) carriedProfile.mealsPerDay = profile.mealsPerDay;
    } catch (err) {
      // Non-fatal — the plan still generates with sensible defaults.
    }
  })();

  function optVal(id) { var v = document.getElementById(id).value; return v || undefined; }
  function optText(id) { var v = document.getElementById(id).value.trim(); return v || undefined; }

  var submitBtn = document.getElementById('nutritionIntakeBtn');
  submitBtn.addEventListener('click', async function () {
    hideError();

    var payload = {
      dietaryApproach: optVal('dietaryApproach'),
      activityLevel: optVal('activityLevel'),
      nutritionGoals: optText('nutritionGoals'),
      foodAllergies: optText('foodAllergies')
    };

    Object.keys(carriedProfile).forEach(function (k) {
      if (payload[k] === undefined) payload[k] = carriedProfile[k];
    });

    Object.keys(payload).forEach(function (k) {
      if (payload[k] === undefined) delete payload[k];
    });

    submitBtn.disabled = true;
    submitBtn.textContent = 'Building your strategy...';

    try {
      var res = await apiPost('/api/v1/onboarding/nutrition-intake', payload);
      if (res.success) {
        goToStep(2);
      } else {
        showError('Failed to build your nutrition strategy. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Build My Nutrition Strategy';
      }
    } catch (err) {
      showError(err.message || 'Something went wrong.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Build My Nutrition Strategy';
    }
  });
})();
