(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Wrap every character in a span, keeping inline elements such as <em>.
  const splitChars = (el) => {
    let index = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
          return;
        }
        if (child.nodeType !== Node.TEXT_NODE) return;

        const fragment = document.createDocumentFragment();
        for (const ch of child.textContent) {
          if (/\s/.test(ch)) {
            fragment.appendChild(document.createTextNode(ch));
            continue;
          }
          const span = document.createElement("span");
          span.className = "char";
          span.style.setProperty("--i", index++);
          span.textContent = ch;
          fragment.appendChild(span);
        }
        child.replaceWith(fragment);
      });
    };
    walk(el);
  };

  // Wrap every word in a mask so it can rise into view.
  const splitWords = (el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", words.join(" "));
    el.textContent = "";
    words.forEach((word, i) => {
      const mask = document.createElement("span");
      mask.className = "word";
      mask.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.className = "word__inner";
      inner.style.setProperty("--i", i);
      inner.textContent = word;
      mask.appendChild(inner);
      el.appendChild(mask);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    });
  };

  document.querySelectorAll("[data-split-words]").forEach(splitWords);

  // Hero headline: cycle through each language, letter by letter.
  document.querySelectorAll("[data-cycle]").forEach((title) => {
    const phrases = [...title.querySelectorAll(".hero__phrase")];
    phrases.forEach((phrase) => {
      splitChars(phrase);
      phrase.setAttribute("aria-hidden", "true");
    });
    title.classList.add("is-split");

    let current = 0;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => phrases[current].classList.add("is-active")),
    );

    if (reduceMotion || phrases.length < 2) return;

    setInterval(() => {
      if (document.hidden) return;
      phrases[current].classList.remove("is-active");
      current = (current + 1) % phrases.length;
      phrases[current].classList.add("is-active");
    }, 4800);
  });

  // Scroll reveal: elements entering together are staggered.
  const revealEls = document.querySelectorAll(
    "[data-reveal], [data-split-words], [data-reveal-lines]",
  );

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, i) => {
            entry.target.style.setProperty("--reveal-delay", `${i * 90}ms`);
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    revealEls.forEach((el) => revealObserver.observe(el));
  }

  // Smooth, inertial scrolling. The page still works if the library is missing.
  let lenis = null;

  if (!reduceMotion && window.Lenis) {
    lenis = new window.Lenis({ autoRaf: true, lerp: 0.09 });

    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || link.classList.contains("skip-link")) return;

      const hash = link.getAttribute("href");
      const target = hash === "#top" ? 0 : document.querySelector(hash);
      if (target === null) return;

      event.preventDefault();
      lenis.scrollTo(target, { duration: 1.6 });
    });
  }

  // Scroll-linked depth: the hero drifts away and project media float.
  const hero = document.querySelector(".hero");
  const parallaxEls = [...document.querySelectorAll("[data-parallax]")];
  let scrollTicking = false;

  const updateScrollEffects = () => {
    const viewport = window.innerHeight;

    if (hero) {
      const rect = hero.getBoundingClientRect();
      const progress = Math.min(Math.max(-rect.top / rect.height, 0), 1);
      hero.style.setProperty("--hero-progress", progress.toFixed(4));
    }

    parallaxEls.forEach((el) => {
      const rect = el.parentElement.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > viewport) return;
      const offset = (rect.top + rect.height / 2 - viewport / 2) / (viewport / 2 + rect.height / 2);
      el.style.setProperty("--parallax", offset.toFixed(4));
    });

    scrollTicking = false;
  };

  const requestScrollEffects = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateScrollEffects);
  };

  if (!reduceMotion) {
    window.addEventListener("scroll", requestScrollEffects, { passive: true });
    window.addEventListener("resize", requestScrollEffects);
    updateScrollEffects();
  }

  // Custom cursor: a white dot that trails the pointer, opens over links,
  // and carries a label over anything marked with data-cursor-label.
  const cursor = document.querySelector("[data-cursor]");

  if (cursor && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    root.classList.add("has-cursor");

    const label = cursor.querySelector(".cursor__label");
    const ease = reduceMotion ? 1 : 0.22;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const position = { ...target };
    let frame = 0;

    const render = () => {
      position.x += (target.x - position.x) * ease;
      position.y += (target.y - position.y) * ease;
      cursor.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;

      const settled = Math.abs(target.x - position.x) + Math.abs(target.y - position.y) < 0.1;
      frame = settled ? 0 : requestAnimationFrame(render);
    };

    window.addEventListener(
      "pointermove",
      (event) => {
        target.x = event.clientX;
        target.y = event.clientY;
        cursor.classList.add("is-visible");
        if (!frame) frame = requestAnimationFrame(render);
      },
      { passive: true },
    );

    document.addEventListener("pointerover", (event) => {
      const labelled = event.target.closest("[data-cursor-label]");
      if (labelled) label.textContent = labelled.dataset.cursorLabel;
      cursor.classList.toggle("is-label", Boolean(labelled));
      cursor.classList.toggle("is-hover", !labelled && Boolean(event.target.closest("a, button")));
    });

    root.addEventListener("pointerleave", () => cursor.classList.remove("is-visible"));
  }

  // Local time in Seoul.
  const clock = document.querySelector("[data-clock]");
  if (clock) {
    const format = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const tick = () => {
      clock.textContent = format.format(new Date());
    };
    tick();
    setInterval(tick, 10000);
  }
})();
