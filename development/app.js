(() => {
  "use strict";

  const config = window.BLACKSTONE_DEVELOPMENT_CONFIG;
  if (!config) return;

  const state = {
    view: "home",
    products: [],
    liveProducts: [],
    filter: "all",
    productSearch: "",
    productSort: "featured",
    docsSearch: "",
    selectedDoc: "",
    updatesSearch: "",
    lastFocused: null
  };

  const elements = {};
  let toastTimer = 0;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanText(value) {
    const helper = document.createElement("div");
    helper.innerHTML = String(value || "");
    return (helper.textContent || "").replace(/\s+/g, " ").trim();
  }

  function safeUrl(value, fallback = "") {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      if (url.protocol === "https:" || url.origin === window.location.origin) {
        return url.href;
      }
    } catch {}
    return fallback;
  }

  function parsePrice(label) {
    const match = String(label || "").replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  }

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value || "Not listed";
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function normaliseLiveProduct(item, index) {
    const title = cleanText(item?.title || item?.name || `Product ${index + 1}`);
    const purchaseUrl = safeUrl(
      item?.purchaseUrl || item?.url || item?.link,
      config.brand.storeUrl
    );
    return {
      id: String(item?.id || slugify(title) || index),
      slug: slugify(title),
      title,
      category: cleanText(item?.category || "Blackstone Development"),
      description: cleanText(item?.description || "View this package on the official Blackstone Development Tebex store."),
      imageUrl: safeUrl(item?.imageUrl || item?.image, ""),
      priceLabel: cleanText(item?.priceLabel || item?.price || "View Details"),
      purchaseUrl,
      soldOut: Boolean(item?.soldOut),
      featured: Boolean(item?.featured),
      published: item?.published !== false,
      source: item?.source || "website",
      updatedAt: item?.updatedAt || "",
      buttonLabel: cleanText(item?.buttonLabel || "View Package")
    };
  }

  function findProfile(liveProduct) {
    const title = liveProduct.title.toLowerCase();
    return config.products.find((profile) => {
      const names = [profile.title, ...(profile.aliases || [])].map((value) => value.toLowerCase());
      return names.some((name) => title.includes(name) || name.includes(title));
    });
  }

  function mergeCatalogue(liveProducts) {
    const matchedProfiles = new Set();
    const merged = liveProducts
      .filter((product) => product.published)
      .map((liveProduct) => {
        const profile = findProfile(liveProduct);
        if (profile) matchedProfiles.add(profile.slug);
        return {
          ...(profile || genericProfile(liveProduct)),
          ...liveProduct,
          slug: profile?.slug || liveProduct.slug,
          frameworks: profile?.frameworks || inferFrameworks(liveProduct),
          dependencies: profile?.dependencies || ["See package documentation"],
          tags: profile?.tags || [],
          version: profile?.version || "Current",
          updatedAt: liveProduct.updatedAt || profile?.updatedAt || "",
          status: liveProduct.soldOut ? "Sold Out" : profile?.status || (liveProduct.featured ? "Featured" : "Available"),
          performance: profile?.performance || "Designed with practical FiveM server performance in mind.",
          installationDifficulty: profile?.installationDifficulty || "See Documentation",
          features: profile?.features || ["Full package details are available on the official Tebex listing."],
          installation: profile?.installation || ["Follow the installation files included with the purchased package."],
          configuration: profile?.configuration || ["See the package configuration file and documentation."],
          troubleshooting: profile?.troubleshooting || ["Copy the full server or client console error before opening a support ticket."],
          changelog: profile?.changelog || [],
          comingSoon: false,
          isLive: true
        };
      });

    for (const profile of config.products) {
      if (matchedProfiles.has(profile.slug)) continue;
      merged.push({
        ...profile,
        id: profile.slug,
        imageUrl: "",
        priceLabel: profile.status === "Coming Soon" ? "Coming Soon" : "View Store",
        purchaseUrl: config.brand.storeUrl,
        soldOut: false,
        featured: profile.status === "New",
        published: true,
        source: "profile",
        buttonLabel: profile.status === "Coming Soon" ? "View Preview" : "View Details",
        comingSoon: profile.status === "Coming Soon",
        isLive: false
      });
    }

    return merged;
  }

  function genericProfile(liveProduct) {
    return {
      slug: liveProduct.slug,
      aliases: [],
      frameworks: inferFrameworks(liveProduct),
      dependencies: ["See Tebex package description"],
      tags: [],
      version: "Current",
      updatedAt: liveProduct.updatedAt || "",
      status: liveProduct.featured ? "Featured" : "Available",
      performance: "See the package documentation for performance and configuration information.",
      installationDifficulty: "See Documentation",
      features: ["Official Blackstone Development package", "Secure Tebex purchase and entitlement"],
      installation: [
        "Purchase the package through the official Tebex listing.",
        "Download the resource using your Cfx.re entitlement.",
        "Read the included installation guide before starting it.",
        "Open a support ticket with complete error details if required."
      ],
      configuration: ["See the included configuration file."],
      troubleshooting: ["Check dependency order and copy the complete console error."],
      changelog: []
    };
  }

  function inferFrameworks(product) {
    const text = `${product.title} ${product.category} ${product.description}`.toLowerCase();
    const values = [];
    if (text.includes("qbcore") || text.includes("qb-core")) values.push("QBCore");
    if (text.includes("qbox")) values.push("Qbox");
    if (text.includes("esx")) values.push("ESX");
    if (text.includes("standalone")) values.push("Standalone");
    return values.length ? values : ["QBCore"];
  }

  async function loadCatalogue() {
    showSkeletons();
    let payload = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8500);
      const response = await fetch("/api/portal?action=development-shop", {
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
      payload = await response.json();
    } catch (error) {
      console.warn("Blackstone Development catalogue fallback:", error);
    }

    const rawProducts =
      (Array.isArray(payload?.shop) && payload.shop) ||
      (Array.isArray(payload?.data?.shop) && payload.data.shop) ||
      [];

    state.liveProducts = rawProducts.map(normaliseLiveProduct);
    state.products = mergeCatalogue(state.liveProducts);

    updateSyncStatus(Boolean(payload), state.liveProducts.length);
    populateSupportProducts();
    renderFeatured();
    renderBundles();
    renderProducts();
    renderDocsNav();
    renderUpdates();
    updateProductCount();

    const requestedProduct = new URLSearchParams(location.search).get("product");
    if (requestedProduct) {
      const product = state.products.find((item) => item.slug === requestedProduct);
      if (product) requestAnimationFrame(() => openProduct(product.slug, false));
    }
  }

  function showSkeletons() {
    const skeletons = Array.from({ length: 3 }, () => '<div class="product-skeleton" aria-hidden="true"></div>').join("");
    elements.featuredGrid.innerHTML = skeletons;
    elements.productGrid.innerHTML = skeletons;
  }

  function updateSyncStatus(connected, liveCount) {
    if (connected) {
      elements.syncLabel.textContent = liveCount ? "CATALOGUE CONNECTED" : "STORE REVIEW / SYNC PENDING";
      elements.syncDetail.textContent = liveCount
        ? `${liveCount} live website product${liveCount === 1 ? "" : "s"} loaded.`
        : "Prepared product profiles are displayed until Tebex listings become public.";
      elements.terminalCatalogue.textContent = liveCount ? "ONLINE" : "PREVIEW";
    } else {
      elements.syncLabel.textContent = "CATALOGUE PREVIEW MODE";
      elements.syncDetail.textContent = "The public API could not be reached, so prepared product profiles are displayed.";
      elements.terminalCatalogue.textContent = "PREVIEW";
    }
  }

  function updateProductCount() {
    elements.heroProductCount.textContent = String(state.products.length);
  }

  function productBadges(product) {
    const badges = [];
    const status = product.soldOut ? "Sold Out" : product.status;
    if (product.featured && status !== "New") badges.push(["Featured", "badge-featured"]);
    if (status === "New") badges.push(["New", "badge-new"]);
    if (status === "Coming Soon") badges.push(["Coming Soon", "badge-warning"]);
    if (status === "Sold Out") badges.push(["Sold Out", "badge-danger"]);
    if (/^\s*(free|\$0(?:\.00)?)\s*$/i.test(product.priceLabel)) badges.push(["Free", "badge-free"]);
    return badges.map(([label, className]) => `<span class="badge ${className}">${escapeHtml(label)}</span>`).join("");
  }

  function productCard(product) {
    const image = product.imageUrl
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)} product preview" loading="lazy" decoding="async">`
      : `<div class="product-placeholder"><img src="../assets/blackstone-logo.webp" alt="" loading="lazy"></div>`;

    const frameworks = (product.frameworks || [])
      .slice(0, 4)
      .map((framework) => `<span class="framework-pill">${escapeHtml(framework)}</span>`)
      .join("");

    const priceSub = product.comingSoon ? "Preview profile" : product.isLive ? "Official listing" : "Development profile";

    return `
      <article class="product-card" data-product-card="${escapeHtml(product.slug)}">
        <div class="product-media">
          ${image}
          <div class="badge-row">${productBadges(product)}</div>
        </div>
        <div class="product-body">
          <p class="product-category">${escapeHtml(product.category)}</p>
          <h3>${escapeHtml(product.title)}</h3>
          <p class="product-description">${escapeHtml(product.description)}</p>
          <div class="framework-list">${frameworks}</div>
          <div class="product-footer">
            <div class="product-price">
              <strong>${escapeHtml(product.priceLabel)}</strong>
              <span>${escapeHtml(priceSub)}</span>
            </div>
            <button class="card-button" type="button" data-product-open="${escapeHtml(product.slug)}">
              Details →
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderFeatured() {
    const featured = [...state.products]
      .sort((a, b) => Number(b.featured) - Number(a.featured))
      .slice(0, 3);
    elements.featuredGrid.innerHTML = featured.map(productCard).join("");
  }

  function renderBundles() {
    elements.bundleGrid.innerHTML = config.bundles.map((bundle) => `
      <article class="bundle-card">
        <small>${escapeHtml(bundle.status)}</small>
        <h3>${escapeHtml(bundle.title)}</h3>
        <p>${escapeHtml(bundle.description)}</p>
        <div class="bundle-products">
          ${bundle.products.map((product) => `<span>${escapeHtml(product)}</span>`).join("")}
        </div>
        <div class="bundle-bottom">
          <div class="bundle-status">
            <strong>${bundle.products.length} RESOURCES</strong>
            <span>Bundle-ready catalogue</span>
          </div>
          <button class="card-button" type="button" data-view-target="${escapeHtml(bundle.targetView)}">${escapeHtml(bundle.actionLabel)} →</button>
        </div>
      </article>
    `).join("");
  }

  function productMatches(product) {
    const search = state.productSearch.toLowerCase().trim();
    const haystack = [
      product.title,
      product.category,
      product.description,
      ...(product.frameworks || []),
      ...(product.tags || []),
      ...(product.features || [])
    ].join(" ").toLowerCase();

    const searchMatch = !search || haystack.includes(search);
    if (!searchMatch) return false;

    if (state.filter === "all") return true;
    if (state.filter === "Free") return /^\s*(free|\$0(?:\.00)?)\s*$/i.test(product.priceLabel);
    if (state.filter === "Coming Soon") return product.status === "Coming Soon";
    return (product.frameworks || []).some((framework) => framework.toLowerCase() === state.filter.toLowerCase());
  }

  function sortProducts(products) {
    return [...products].sort((a, b) => {
      if (state.productSort === "name") return a.title.localeCompare(b.title);
      if (state.productSort === "price-low") return parsePrice(a.priceLabel) - parsePrice(b.priceLabel);
      if (state.productSort === "price-high") return parsePrice(b.priceLabel) - parsePrice(a.priceLabel);
      if (state.productSort === "updated") return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      return Number(b.featured) - Number(a.featured) || Number(b.isLive) - Number(a.isLive) || a.title.localeCompare(b.title);
    });
  }

  function renderProducts() {
    const visible = sortProducts(state.products.filter(productMatches));
    elements.productGrid.innerHTML = visible.map(productCard).join("");
    elements.productEmpty.classList.toggle("is-hidden", visible.length > 0);
    elements.catalogueSummary.textContent = `${visible.length} of ${state.products.length} product${state.products.length === 1 ? "" : "s"}`;
  }

  function renderDocsNav() {
    const search = state.docsSearch.toLowerCase().trim();
    const products = state.products.filter((product) => {
      const text = `${product.title} ${product.category} ${(product.frameworks || []).join(" ")}`.toLowerCase();
      return !search || text.includes(search);
    });

    elements.docsNav.innerHTML = products.length
      ? products.map((product) => `
          <button class="docs-nav-button ${state.selectedDoc === product.slug ? "is-active" : ""}" type="button" data-doc-product="${escapeHtml(product.slug)}">
            <strong>${escapeHtml(product.title)}</strong>
            <span>${escapeHtml(product.version)} · ${escapeHtml((product.frameworks || []).join(", "))}</span>
          </button>
        `).join("")
      : `<div class="empty-state"><p>No documentation matches that search.</p></div>`;
  }

  function renderDoc(product) {
    state.selectedDoc = product.slug;
    renderDocsNav();

    const list = (items) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    elements.docsContent.innerHTML = `
      <header class="docs-header">
        <span class="docs-kicker">${escapeHtml(product.category)}</span>
        <h2>${escapeHtml(product.title)}</h2>
        <p>${escapeHtml(product.description)}</p>
        <div class="docs-meta">
          <span>Version ${escapeHtml(product.version)}</span>
          <span>${escapeHtml(product.installationDifficulty)} installation</span>
          ${(product.frameworks || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      </header>

      <section class="docs-section">
        <h3>Requirements</h3>
        <ul>${list(product.dependencies || [])}</ul>
      </section>

      <section class="docs-section">
        <h3>Installation</h3>
        <ol>${list(product.installation || [])}</ol>
        <div class="docs-callout">Back up your database and configuration before installing or updating any production resource.</div>
      </section>

      <section class="docs-section">
        <h3>Recommended resource order</h3>
        <pre class="code-block">ensure oxmysql
ensure ox_lib
ensure your_framework
ensure ${escapeHtml(product.slug.replace(/-/g, "_"))}</pre>
      </section>

      <section class="docs-section">
        <h3>Configuration areas</h3>
        <ul>${list(product.configuration || [])}</ul>
      </section>

      <section class="docs-section">
        <h3>Performance notes</h3>
        <p>${escapeHtml(product.performance)}</p>
      </section>

      <section class="docs-section">
        <h3>Troubleshooting</h3>
        <ul>${list(product.troubleshooting || [])}</ul>
      </section>

      <section class="docs-section">
        <h3>Still need help?</h3>
        <p>Generate a complete support message with the product, framework, version and error details.</p>
        <button class="button button-primary" type="button" data-support-product="${escapeHtml(product.slug)}">Open Support Builder →</button>
      </section>
    `;
  }

  function allUpdates() {
    return state.products.flatMap((product) =>
      (product.changelog || []).map((entry) => ({ ...entry, productTitle: product.title, productSlug: product.slug }))
    ).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function renderUpdates() {
    const search = state.updatesSearch.toLowerCase().trim();
    const updates = allUpdates().filter((update) => {
      const text = `${update.productTitle} ${update.version} ${update.type} ${(update.changes || []).join(" ")}`.toLowerCase();
      return !search || text.includes(search);
    });

    elements.updatesCount.textContent = `${updates.length} update${updates.length === 1 ? "" : "s"}`;
    elements.updatesList.innerHTML = updates.length
      ? updates.map((update) => `
          <article class="update-card">
            <div class="update-side">
              <strong>V${escapeHtml(update.version)}</strong>
              <span>${escapeHtml(formatDate(update.date))}</span>
            </div>
            <div class="update-main">
              <span class="change-type">${escapeHtml(update.type || "Update")}</span>
              <h2>${escapeHtml(update.productTitle)}</h2>
              <p>Version ${escapeHtml(update.version)}</p>
              <ul class="change-list">
                ${(update.changes || []).map((change) => `<li>${escapeHtml(change)}</li>`).join("")}
              </ul>
            </div>
          </article>
        `).join("")
      : `<div class="empty-state"><h2>No matching updates</h2><p>Try another product name or version.</p></div>`;
  }

  function populateSupportProducts() {
    elements.supportProduct.innerHTML = state.products.map((product) =>
      `<option value="${escapeHtml(product.slug)}">${escapeHtml(product.title)}</option>`
    ).join("");
  }

  function renderFaqs() {
    elements.faqList.innerHTML = config.faqs.map((item, index) => `
      <article class="faq-item">
        <button class="faq-question" type="button" aria-expanded="false" aria-controls="faq-${index}">
          <strong>${escapeHtml(item.question)}</strong><span aria-hidden="true">+</span>
        </button>
        <div class="faq-answer" id="faq-${index}">
          <p>${escapeHtml(item.answer)}</p>
        </div>
      </article>
    `).join("");
  }

  function showView(view, pushHistory = true) {
    if (!q(`[data-view="${view}"]`)) view = "home";
    state.view = view;

    qa("[data-view]").forEach((section) => section.classList.toggle("is-active", section.dataset.view === view));
    qa(".nav-link[data-view-target]").forEach((button) => button.classList.toggle("is-active", button.dataset.viewTarget === view));

    elements.mainNav.classList.remove("is-open");
    elements.mobileMenu.setAttribute("aria-expanded", "false");

    if (pushHistory) {
      const url = new URL(location.href);
      url.hash = view === "home" ? "" : view;
      url.searchParams.delete("product");
      history.pushState({ view }, "", url);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    document.title = `${view === "home" ? "Blackstone Development" : `${view[0].toUpperCase()}${view.slice(1)} | Blackstone Development`}`;
  }

  function openProduct(slug, updateUrl = true) {
    const product = state.products.find((item) => item.slug === slug);
    if (!product) return;

    state.lastFocused = document.activeElement;
    const image = product.imageUrl
      ? `<img class="dialog-hero-image" src="${escapeHtml(product.imageUrl)}" alt="" loading="eager">`
      : "";

    const purchaseLabel = product.comingSoon ? "Open Store" : product.soldOut ? "View Sold Out Package" : "Purchase on Tebex";
    const features = (product.features || []).map((feature) => `<div class="feature-item">${escapeHtml(feature)}</div>`).join("");
    const changelog = (product.changelog || []).slice(0, 3).map((entry) => `
      <article>
        <strong>Version ${escapeHtml(entry.version)}</strong>
        <span>${escapeHtml(formatDate(entry.date))}</span>
        <ul>${(entry.changes || []).map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul>
      </article>
    `).join("") || `<p>No public version notes have been added yet.</p>`;

    elements.dialogContent.innerHTML = `
      <section class="dialog-hero">
        ${image}
        <div class="dialog-hero-copy">
          <div class="badge-row">${productBadges(product)}</div>
          <p class="product-category">${escapeHtml(product.category)}</p>
          <h2 id="dialogTitle">${escapeHtml(product.title)}</h2>
          <p>${escapeHtml(product.description)}</p>
        </div>
      </section>
      <div class="dialog-content-grid">
        <div class="dialog-main">
          <section>
            <h3>Included Features</h3>
            <div class="feature-grid">${features}</div>
          </section>
          <section>
            <h3>Performance</h3>
            <p>${escapeHtml(product.performance)}</p>
          </section>
          <section>
            <h3>Recent Changelog</h3>
            <div class="changelog-mini">${changelog}</div>
          </section>
        </div>
        <aside class="dialog-side">
          <div class="dialog-price">
            <span>${product.isLive ? "Current listing" : "Product profile"}</span>
            <strong>${escapeHtml(product.priceLabel)}</strong>
          </div>
          <div class="spec-list">
            <div class="spec-row"><span>Version</span><strong>${escapeHtml(product.version)}</strong></div>
            <div class="spec-row"><span>Updated</span><strong>${escapeHtml(formatDate(product.updatedAt))}</strong></div>
            <div class="spec-row"><span>Installation</span><strong>${escapeHtml(product.installationDifficulty)}</strong></div>
            <div class="spec-row"><span>Frameworks</span><strong>${escapeHtml((product.frameworks || []).join(", "))}</strong></div>
          </div>
          <a class="button button-primary" href="${escapeHtml(product.purchaseUrl)}" target="_blank" rel="noopener noreferrer" data-purchase-click="${escapeHtml(product.slug)}">${escapeHtml(purchaseLabel)} ↗</a>
          <button class="button button-secondary" type="button" data-doc-open="${escapeHtml(product.slug)}">Read Documentation</button>
          <button class="button button-secondary" type="button" data-support-product="${escapeHtml(product.slug)}">Get Support</button>
        </aside>
      </div>
    `;

    if (typeof elements.productDialog.showModal === "function") {
      elements.productDialog.showModal();
    } else {
      elements.productDialog.setAttribute("open", "");
    }
    document.body.classList.add("dialog-open");

    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("product", product.slug);
      history.pushState({ view: state.view, product: product.slug }, "", url);
    }

    recordLocalEvent("product_view", product.slug);
  }

  function closeProduct(updateUrl = true) {
    if (elements.productDialog.open) elements.productDialog.close();
    document.body.classList.remove("dialog-open");
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.delete("product");
      history.pushState({ view: state.view }, "", url);
    }
    if (state.lastFocused instanceof HTMLElement) state.lastFocused.focus();
  }

  function openSupportForProduct(slug) {
    closeProduct(false);
    showView("support");
    if (slug && elements.supportProduct.querySelector(`option[value="${CSS.escape(slug)}"]`)) {
      elements.supportProduct.value = slug;
      const product = state.products.find((item) => item.slug === slug);
      if (product) elements.supportVersion.value = product.version || "";
    }
    elements.supportForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function generateTicket(event) {
    event.preventDefault();
    const product = state.products.find((item) => item.slug === elements.supportProduct.value);
    const output = [
      "**BLACKSTONE DEVELOPMENT SUPPORT REQUEST**",
      "",
      `**Request type:** ${elements.supportType.value}`,
      `**Product:** ${product?.title || elements.supportProduct.value}`,
      `**Framework:** ${elements.supportFramework.value}`,
      `**Product version:** ${elements.supportVersion.value.trim() || "Unknown"}`,
      `**Tebex transaction ID:** ${elements.supportTransaction.value.trim() || "Not supplied / not applicable"}`,
      "",
      "**Description**",
      elements.supportDescription.value.trim(),
      "",
      "**Relevant error**",
      elements.supportError.value.trim() || "No error supplied.",
      "",
      "**Checks completed**",
      "- [ ] Read the product documentation",
      "- [ ] Confirmed dependencies and start order",
      "- [ ] Restarted the affected resource/server",
      "- [ ] Removed private keys, passwords and tokens from this report"
    ].join("\n");

    elements.ticketOutput.textContent = output;
    elements.generatedTicket.classList.remove("is-hidden");
    elements.generatedTicket.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function copyTicket() {
    try {
      await navigator.clipboard.writeText(elements.ticketOutput.textContent);
      showToast("Support message copied.");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(elements.ticketOutput);
      selection.removeAllRanges();
      selection.addRange(range);
      showToast("Select and copy the highlighted support message.");
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
  }

  function recordLocalEvent(type, product = "") {
    try {
      const key = "blackstone-development-local-insights";
      const current = JSON.parse(localStorage.getItem(key) || '{"events":{}}');
      const eventKey = product ? `${type}:${product}` : type;
      current.events[eventKey] = (Number(current.events[eventKey]) || 0) + 1;
      current.updatedAt = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(current));
    } catch {}
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view-target]");
      if (viewButton) {
        event.preventDefault();
        showView(viewButton.dataset.viewTarget);
        return;
      }

      const productButton = event.target.closest("[data-product-open]");
      if (productButton) {
        openProduct(productButton.dataset.productOpen);
        return;
      }

      const docButton = event.target.closest("[data-doc-product]");
      if (docButton) {
        const product = state.products.find((item) => item.slug === docButton.dataset.docProduct);
        if (product) renderDoc(product);
        return;
      }

      const dialogDoc = event.target.closest("[data-doc-open]");
      if (dialogDoc) {
        closeProduct(false);
        showView("docs");
        const product = state.products.find((item) => item.slug === dialogDoc.dataset.docOpen);
        if (product) renderDoc(product);
        return;
      }

      const supportProduct = event.target.closest("[data-support-product]");
      if (supportProduct) {
        openSupportForProduct(supportProduct.dataset.supportProduct);
        return;
      }

      const supportType = event.target.closest("[data-support-type]");
      if (supportType) {
        showView("support");
        elements.supportType.value = supportType.dataset.supportType;
        elements.supportForm.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const purchase = event.target.closest("[data-purchase-click]");
      if (purchase) recordLocalEvent("purchase_click", purchase.dataset.purchaseClick);

      const faqQuestion = event.target.closest(".faq-question");
      if (faqQuestion) {
        const item = faqQuestion.closest(".faq-item");
        const open = item.classList.toggle("is-open");
        faqQuestion.setAttribute("aria-expanded", String(open));
      }
    });

    elements.mobileMenu.addEventListener("click", () => {
      const open = elements.mainNav.classList.toggle("is-open");
      elements.mobileMenu.setAttribute("aria-expanded", String(open));
    });

    elements.productSearch.addEventListener("input", () => {
      state.productSearch = elements.productSearch.value;
      renderProducts();
    });

    elements.productSort.addEventListener("change", () => {
      state.productSort = elements.productSort.value;
      renderProducts();
    });

    elements.productFilters.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-filter]");
      if (!chip) return;
      state.filter = chip.dataset.filter;
      qa("[data-filter]", elements.productFilters).forEach((item) => item.classList.toggle("is-active", item === chip));
      renderProducts();
    });

    elements.clearProductFilters.addEventListener("click", () => {
      state.filter = "all";
      state.productSearch = "";
      elements.productSearch.value = "";
      qa("[data-filter]", elements.productFilters).forEach((item) => item.classList.toggle("is-active", item.dataset.filter === "all"));
      renderProducts();
    });

    elements.docsSearch.addEventListener("input", () => {
      state.docsSearch = elements.docsSearch.value;
      renderDocsNav();
    });

    elements.updatesSearch.addEventListener("input", () => {
      state.updatesSearch = elements.updatesSearch.value;
      renderUpdates();
    });

    elements.supportForm.addEventListener("submit", generateTicket);
    elements.copyTicket.addEventListener("click", copyTicket);

    elements.dialogClose.addEventListener("click", () => closeProduct());
    elements.productDialog.addEventListener("click", (event) => {
      if (event.target === elements.productDialog) closeProduct();
    });
    elements.productDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeProduct();
    });

    window.addEventListener("scroll", () => {
      elements.siteHeader.classList.toggle("is-scrolled", window.scrollY > 12);
    }, { passive: true });

    window.addEventListener("popstate", () => {
      const productSlug = new URLSearchParams(location.search).get("product");
      const hashView = location.hash.replace("#", "") || "home";
      showView(hashView, false);

      if (productSlug) {
        const product = state.products.find((item) => item.slug === productSlug);
        if (product) openProduct(product.slug, false);
      } else if (elements.productDialog.open) {
        closeProduct(false);
      }
    });
  }

  function cacheElements() {
    Object.assign(elements, {
      siteHeader: q("#siteHeader"),
      mobileMenu: q("#mobileMenu"),
      mainNav: q("#mainNav"),
      heroProductCount: q("#heroProductCount"),
      syncLabel: q("#syncLabel"),
      syncDetail: q("#syncDetail"),
      terminalCatalogue: q("#terminalCatalogue"),
      featuredGrid: q("#featuredGrid"),
      bundleGrid: q("#bundleGrid"),
      productSearch: q("#productSearch"),
      productSort: q("#productSort"),
      productFilters: q("#productFilters"),
      productGrid: q("#productGrid"),
      productEmpty: q("#productEmpty"),
      catalogueSummary: q("#catalogueSummary"),
      clearProductFilters: q("#clearProductFilters"),
      docsSearch: q("#docsSearch"),
      docsNav: q("#docsNav"),
      docsContent: q("#docsContent"),
      updatesSearch: q("#updatesSearch"),
      updatesCount: q("#updatesCount"),
      updatesList: q("#updatesList"),
      supportForm: q("#supportForm"),
      supportType: q("#supportType"),
      supportProduct: q("#supportProduct"),
      supportFramework: q("#supportFramework"),
      supportVersion: q("#supportVersion"),
      supportTransaction: q("#supportTransaction"),
      supportDescription: q("#supportDescription"),
      supportError: q("#supportError"),
      generatedTicket: q("#generatedTicket"),
      ticketOutput: q("#ticketOutput"),
      copyTicket: q("#copyTicket"),
      faqList: q("#faqList"),
      productDialog: q("#productDialog"),
      dialogContent: q("#dialogContent"),
      dialogClose: q("#dialogClose"),
      toast: q("#toast")
    });
  }

  function initialise() {
    cacheElements();
    bindEvents();
    renderFaqs();

    const initialView = location.hash.replace("#", "") || "home";
    showView(initialView, false);
    loadCatalogue();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, { once: true });
  } else {
    initialise();
  }
})();
