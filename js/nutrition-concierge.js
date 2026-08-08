/**
 * Vintus Performance — Concierge Nutrition Strategy Intake
 * For an active Private Coaching client using their bundled nutrition
 * benefit for the first time. Same depth as the standalone add-on
 * nutrition intake (nutrition-intake.js) — a real strategy needs the same
 * detail regardless of whether nutrition was purchased separately or came
 * bundled with the membership. Prefills anything already on file from
 * onboarding rather than re-asking. Submits to
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

  // Pre-fill anything already known from onboarding, so a Private Coaching
  // client isn't asked for data Vintus already has.
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
      if (profile.mealsPerDay) document.getElementById('mealsPerDay').value = profile.mealsPerDay;
      if (profile.activityLevel) document.getElementById('activityLevel').value = profile.activityLevel;
      if (profile.dietaryApproach) document.getElementById('dietaryApproach').value = profile.dietaryApproach;
      if (profile.foodAllergies) document.getElementById('foodAllergies').value = profile.foodAllergies;
      if (profile.foodsLoved) document.getElementById('foodsLoved').value = profile.foodsLoved;
      if (profile.foodsHated) document.getElementById('foodsHated').value = profile.foodsHated;
      if (profile.cookingSkill) document.getElementById('cookingSkill').value = profile.cookingSkill;
      if (profile.mealPrepTime) document.getElementById('mealPrepTime').value = profile.mealPrepTime;
      if (profile.foodBudget) document.getElementById('foodBudget').value = profile.foodBudget;
      if (profile.chronicConditions) document.getElementById('chronicConditions').value = profile.chronicConditions;
      if (profile.medications) document.getElementById('medications').value = profile.medications;
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
