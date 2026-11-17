(() => {
  const levels = ['Repérer', 'Comprendre', 'Déjouer un piège', 'Justifier', 'Nuancer'];
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  function questions(cases, level) {
    return cases.map(([concept, evidence, claim, error, limit], index) => {
      const other = cases[(index + 1) % cases.length];
      const third = cases[(index + 2) % cases.length];
      const items = [
        ['Quelle notion cette situation illustre-t-elle ?', evidence, [concept, other[0], third[0]], claim],
        ['Quelle interprétation correspond le mieux à la situation ?', evidence, [claim, error, other[2]], limit],
        ['Quelle affirmation faut-il écarter ?', evidence, [error, claim, limit], claim],
        ['Quelle observation appuie directement cette conclusion ?', claim, [evidence, other[1], third[1]], limit],
        ['Quelle précision rend cette conclusion plus rigoureuse ?', claim, [limit, error, other[4]], limit]
      ];
      const [prompt, context, choices, explanation] = items[level];
      const shift = (level * 2 + index + 1) % choices.length;
      return {prompt, context, choices: choices.slice(shift).concat(choices.slice(0, shift)),
        correct: choices[0], explanation};
    });
  }

  for (const section of document.querySelectorAll('.chapter-quiz[data-cases]')) {
    const cases = JSON.parse(section.dataset.cases);
    const app = section.querySelector('.qcm-app');
    const key = 'canopee:qcm:v1:' + location.pathname;
    const status = make('p', '', 'qcm-progress');
    status.setAttribute('role', 'status');
    const nav = make('div', '', 'qcm-levels');
    const panel = make('div');
    app.append(status, nav, panel);

    let completed = 0;
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isInteger(saved) && saved >= 0 && saved <= levels.length) completed = saved;
    } catch {}

    function render(level, focusHeading = false) {
      status.textContent = completed === levels.length
        ? 'Entraînement terminé · 5 niveaux sur 5 validés.'
        : completed + ' niveau' + (completed === 1 ? '' : 'x') + ' sur 5 validé' + (completed === 1 ? '' : 's') + '.';
      const buttons = levels.map((name, index) => {
        const button = make('button', (index + 1) + ' · ' + name);
        button.type = 'button';
        button.disabled = index > completed;
        if (index === level) button.setAttribute('aria-current', 'step');
        button.setAttribute('aria-label', 'Niveau ' + (index + 1) + ' : ' + name
          + (index < completed ? ', validé' : index > completed ? ', verrouillé' : ''));
        button.addEventListener('click', () => render(index, true));
        return button;
      });
      nav.replaceChildren(...buttons);

      const heading = make('h3', 'Niveau ' + (level + 1) + ' · ' + levels[level]);
      heading.tabIndex = -1;
      const form = make('form');
      const feedback = make('p', '', 'qcm-result');
      feedback.setAttribute('role', 'status');
      const passed = level < completed;
      const groups = questions(cases, level).map((question, index) => {
        const field = make('fieldset');
        const legend = make('legend', (index + 1) + '. ' + question.prompt);
        const context = make('p', question.context);
        const message = make('p', '', 'qcm-result');
        message.setAttribute('role', 'status');
        let valid = passed;
        field.append(legend, context);
        question.choices.forEach(choice => {
          const label = make('label', '', 'qcm-option');
          const radio = make('input');
          radio.type = 'radio';
          radio.name = 'qcm-' + index;
          radio.value = choice;
          radio.checked = passed && choice === question.correct;
          label.append(radio, make('span', choice));
          field.append(label);
        });
        field.append(message);
        if (passed) {
          field.disabled = true;
          message.textContent = 'Validée. ' + question.explanation;
        }
        form.append(field);
        return () => {
          if (valid) return true;
          const chosen = field.querySelector('input:checked');
          valid = chosen?.value === question.correct;
          message.textContent = valid ? 'Validée. ' + question.explanation
            : chosen ? 'À revoir. Relis la situation et essaie une autre réponse.' : 'Choisis une réponse.';
          if (valid) field.disabled = true;
          return valid;
        };
      });

      const check = make('button', 'Vérifier mes réponses');
      check.type = 'submit';
      check.hidden = passed;
      const next = make('button', 'Passer au niveau ' + (level + 2));
      next.type = 'button';
      next.hidden = !passed || level === levels.length - 1;
      next.addEventListener('click', () => render(level + 1, true));
      form.append(check, next, feedback);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const count = groups.map(validate => validate()).filter(Boolean).length;
        feedback.textContent = count + ' sur 3 réponses validées.';
        if (count !== groups.length || level !== completed) return;
        completed++;
        try { localStorage.setItem(key, String(completed)); } catch {}
        render(level, true);
      });
      panel.replaceChildren(heading, form);
      if (focusHeading) heading.focus();
    }

    render(Math.min(completed, levels.length - 1));
  }
})();
