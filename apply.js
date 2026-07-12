(() => {
  const form = document.getElementById('applicationForm');
  const steps = [...document.querySelectorAll('.form-step')];
  const stepItems = [...document.querySelectorAll('#stepList li')];
  const titles = ['Choose your application', 'Tell us about yourself', 'Build your roleplay profile', 'Respond to the scenarios', 'Review and submit'];
  let currentStep = 1;
  let databaseReady = false;

  function showStep(step) {
    currentStep = Math.max(1, Math.min(5, step));
    steps.forEach((element) => element.classList.toggle('active', Number(element.dataset.step) === currentStep));
    stepItems.forEach((element) => element.classList.toggle('active', Number(element.dataset.step) <= currentStep));
    document.getElementById('sectionCode').textContent = `SECTION ${String(currentStep).padStart(2, '0')} / 05`;
    document.getElementById('sectionTitle').textContent = titles[currentStep - 1];
    document.getElementById('progressBar').style.width = `${currentStep * 20}%`;
    document.getElementById('prevButton').style.visibility = currentStep === 1 ? 'hidden' : 'visible';
    document.getElementById('nextButton').hidden = currentStep === 5;
    document.getElementById('submitButton').hidden = currentStep !== 5;
    document.getElementById('formAlert').textContent = '';
    if (currentStep === 5) updateReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateStep(step) {
    const section = steps.find((element) => Number(element.dataset.step) === step);
    const controls = [...section.querySelectorAll('input, select, textarea')];
    for (const control of controls) {
      if (!control.checkValidity()) {
        control.reportValidity();
        return false;
      }
    }
    return true;
  }

  function updateReview() {
    const data = new FormData(form);
    document.getElementById('reviewType').textContent = data.get('applicationType') || 'Not selected';
    document.getElementById('reviewDiscord').textContent = data.get('discord') || 'Not entered';
    document.getElementById('reviewFivem').textContent = data.get('fivem') || 'Not entered';
    document.getElementById('reviewExperience').textContent = data.get('experience') || 'Not selected';
  }

  document.getElementById('nextButton').addEventListener('click', () => {
    if (validateStep(currentStep)) showStep(currentStep + 1);
  });
  document.getElementById('prevButton').addEventListener('click', () => showStep(currentStep - 1));

  document.querySelectorAll('textarea[maxlength]').forEach((textarea) => {
    const counter = textarea.parentElement.querySelector('.counter b');
    const update = () => { if (counter) counter.textContent = textarea.value.length; };
    textarea.addEventListener('input', update);
    update();
  });

  async function setupStatus() {
    try {
      const [setupResponse, publicResponse] = await Promise.all([
        fetch('api/portal?action=setup-status', { cache: 'no-store' }),
        fetch('api/portal?action=public', { cache: 'no-store' })
      ]);
      const setup = await setupResponse.json();
      const publicData = await publicResponse.json();
      const applicationsOpen = publicData?.settings?.applicationsOpen !== false;
      databaseReady = Boolean(setup.databaseConfigured && setup.authConfigured && applicationsOpen);
      const warning = document.getElementById('applySetupWarning');
      warning.hidden = databaseReady;
      if (!applicationsOpen) {
        warning.querySelector('strong').textContent = 'APPLICATIONS ARE CURRENTLY CLOSED';
        warning.querySelector('p').textContent = 'Blackstone RP staff have temporarily closed online applications. Check Discord for future openings.';
      }
      document.getElementById('applicationsStatus').textContent = applicationsOpen ? (databaseReady ? 'APPLICATIONS ONLINE' : 'SETUP REQUIRED') : 'APPLICATIONS CLOSED';
    } catch {
      document.getElementById('applySetupWarning').hidden = false;
      document.getElementById('applicationsStatus').textContent = 'STATUS UNAVAILABLE';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const alert = document.getElementById('formAlert');
    if (!validateStep(5)) return;
    if (!databaseReady) {
      alert.textContent = 'The application database has not been connected yet.';
      return;
    }
    const button = document.getElementById('submitButton');
    button.disabled = true;
    button.textContent = 'Submitting…';
    const raw = Object.fromEntries(new FormData(form));
    raw.rulesConfirmed = form.elements.rulesConfirmed.checked;
    raw.honestConfirmed = form.elements.honestConfirmed.checked;
    raw.contactConfirmed = form.elements.contactConfirmed.checked;
    try {
      const response = await fetch('api/portal?action=apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(raw)
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.message || 'Application submission failed.');
      document.getElementById('applicationId').textContent = data.applicationId;
      document.getElementById('successModal').classList.add('open');
      document.getElementById('successModal').setAttribute('aria-hidden', 'false');
      form.reset();
    } catch (error) {
      alert.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Submit Application ↗';
    }
  });

  showStep(1);
  setupStatus();
})();
