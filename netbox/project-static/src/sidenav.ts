import { Collapse } from 'bootstrap';
import { StateManager } from './state';
import { getElements, isElement } from './util';

type NavState = { pinned: boolean };
type BodyAttr = 'show' | 'hide' | 'hidden' | 'pinned';

class SideNav {
  /**
   * Sidenav container element.
   */
  private base: HTMLDivElement;

  /**
   * SideNav internal state manager.
   */
  private state: StateManager<NavState>;

  /**
   * Current state of mobile display.
   */
  private currentMobileState: Nullable<boolean> = null;

  /**
   * The currently active parent nav-link controlling a section.
   */
  private activeLink: Nullable<HTMLAnchorElement> = null;

  /**
   * All collapsible sections and their controlling nav-links.
   */
  private sections: Map<HTMLAnchorElement, InstanceType<typeof Collapse>> = new Map();

  constructor(base: HTMLDivElement) {
    this.base = base;
    this.state = new StateManager<NavState>(
      { pinned: true },
      { persist: true, key: 'netbox-sidenav' },
    );

    this.init();
    this.initSectionLinks();
    this.initActiveLinks();
  }

  /**
   * Determine if `document.body` has a sidenav attribute.
   */
  private bodyHas(attr: BodyAttr): boolean {
    return document.body.hasAttribute(`data-sidenav-${attr}`);
  }

  /**
   * Remove sidenav attributes from `document.body`.
   */
  private bodyRemove(...attrs: BodyAttr[]): void {
    for (const attr of attrs) {
      document.body.removeAttribute(`data-sidenav-${attr}`);
    }
  }

  /**
   * Add sidenav attributes to `document.body`.
   */
  private bodyAdd(...attrs: BodyAttr[]): void {
    for (const attr of attrs) {
      document.body.setAttribute(`data-sidenav-${attr}`, '');
    }
  }

  /**
   * Set initial values & add event listeners.
   */
  private init() {
    for (const toggler of this.base.querySelectorAll('.sidenav-toggle')) {
      toggler.addEventListener('click', event => this.onToggle(event));
    }

    for (const toggler of getElements<HTMLButtonElement>('.sidenav-toggle-mobile')) {
      toggler.addEventListener('click', event => this.onMobileToggle(event));
    }

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    
    this.base.addEventListener('mouseenter', () => this.onEnter());
    this.base.addEventListener('mouseleave', () => this.onLeave());
  }

  /**
   * Show the sidenav.
   */
  private show(): void {
    this.bodyAdd('show');
    this.bodyRemove('hidden', 'hide');
    for (const link of this.getActiveLinks()) {
      this.activateLink(link, 'expand');
    }
  }

  /**
   * Hide the sidenav and collapse all active nav sections.
   */
  private hide(): void {
    this.bodyAdd('hide');
    this.bodyRemove('pinned', 'show');
    for (const [link, collapse] of this.sections) {
      link.classList.add('collapsed');
      link.setAttribute('aria-expanded', 'false');
      collapse.hide();
    }
    this.bodyRemove('hide');
    this.bodyAdd('hidden');
  }

  /**
   * Pin the sidenav.
   */
  private pin(): void {
    this.state.set('pinned', true);
    this.bodyAdd('pinned');
    this.show();
  }

  /**
   * Unpin the sidenav.
   */
  private unpin(): void {
    this.state.set('pinned', false);
    this.hide();
  }

  /**
   * When a section's controlling nav-link is clicked, update this instance's `activeLink`
   * attribute and close all other sections.
   */
  private handleSectionClick(event: Event): void {
    event.preventDefault();
    const element = event.target as HTMLAnchorElement;
    this.activeLink = element;
    this.closeInactiveSections();
  }

  /**
   * Close all sections that are not associated with the currently active link (`activeLink`).
   */
  private closeInactiveSections(): void {
    for (const [link, collapse] of this.sections) {
      if (link !== this.activeLink) {
        link.classList.add('collapsed');
        link.setAttribute('aria-expanded', 'false');
        collapse.hide();
      }
    }
  }

  /**
   * Initialize `bootstrap.Collapse` instances on all section collapse elements and add event
   * listeners to the controlling nav-links.
   */
  private initSectionLinks(): void {
    for (const section of getElements<HTMLAnchorElement>(
      '.navbar-nav .nav-item .nav-link[data-bs-toggle]',
    )) {
      if (section.parentElement !== null) {
        const collapse = section.parentElement.querySelector<HTMLDivElement>('.collapse');
        if (collapse !== null) {
          const collapseInstance = new Collapse(collapse, {
            toggle: false, // Don't automatically open the collapse element on invocation.
          });
          this.sections.set(section, collapseInstance);
          section.addEventListener('click', event => this.handleSectionClick(event));
        }
      }
    }
  }
  
  private initActiveLinks(): void {
    for (const link of this.getActiveLinks()) {
      this.activateLink(link, this.bodyHas('show') ? 'expand' : 'collapse');
    }
  }

  /**
   * Starting from the bottom-most active link in the element tree, work backwards to determine the
   * link's containing `.collapse` element and the `.collapse` element's containing `.nav-link`
   * element. Once found, expand (or collapse) the `.collapse` element and add (or remove) the
   * `.active` class to the the parent `.nav-link` element.
   *
   * @param link Active nav link
   * @param action Expand or Collapse
   */
  private activateLink(link: HTMLAnchorElement, action: 'expand' | 'collapse'): void {
    let navItem: Nullable<HTMLElement> =  link,
        nextItem: Nullable<HTMLDivElement> = null;
    while ((nextItem = navItem.parentElement.closest('.nav-item')) !== null) {
      navItem = nextItem;
    }

    // Find the closest `.nav-link`, which should be adjacent to the `.collapse` element.
    const groupLink = navItem.querySelector(':scope > .nav-link');
    if (isElement(groupLink)) {
      // Find the closest collapsible element, which should contain `link`.
      const collapse = this.sections.get(groupLink);
      if (collapse instanceof Collapse) {
        groupLink.classList.add('active');
        switch (action) {
          case 'expand':
            groupLink.setAttribute('aria-expanded', 'true');
            collapse.show();
            link.classList.add('active');
            groupLink.classList.remove('collapsed');
            break;
          case 'collapse':
            groupLink.setAttribute('aria-expanded', 'false');
            collapse.hide();
            link.classList.remove('active');
            groupLink.classList.add('collapsed');
            break;
        }
      }
    }
  }

  /**
   * Find any nav links with `href` attributes matching the current path, to determine which nav
   * link should be considered active.
   */
  private *getActiveLinks(): Generator<HTMLAnchorElement> {
    for (const link of this.base.querySelectorAll<HTMLAnchorElement>(
      '.navbar-nav .nav .nav-item a.nav-link',
    )) {
      const href = new RegExp(link.href, 'gi');
      if (window.location.href.match(href)) {
        yield link;
      }
    }
  }

  /**
   * Show the sidenav and expand any active sections.
   */
  private onEnter(): void {
    if (!(this.currentMobileState || this.bodyHas('pinned'))) {
      this.show();
    }
  }

  /**
   * Hide the sidenav and collapse any active sections.
   */
  private onLeave(): void {
    if (!(this.currentMobileState || this.bodyHas('pinned'))) {
      this.hide();
    }
  }

  /**
   * Close the (unpinned) sidenav when the window is resized.
   */
  private onResize(): void {
    for (const toggler of getElements<HTMLButtonElement>('.sidenav-toggle-mobile')) {
      if (toggler.offsetParent !== null) {
        if (this.currentMobileState === null || this.currentMobileState === false) {
          this.hide();
          this.currentMobileState = true;
        }
        return;
      }
    }
    if (this.currentMobileState === null || this.currentMobileState === true) {
      if (this.state.get('pinned')) {
        this.pin();
      } else {
        this.unpin();
      }
      this.currentMobileState = false;
    }
  }

  /**
   * Pin & unpin the sidenav when the pin button is toggled.
   */
  private onToggle(event: Event): void {
    event.preventDefault();
    if (this.state.get('pinned')) {
      this.unpin();
    } else {
      this.pin();
    }
  }

  /**
   * Handle sidenav visibility state for small screens. On small screens, there is no pinned state,
   * only open/closed.
   */
  private onMobileToggle(event: Event): void {
    event.preventDefault();
    if (this.bodyHas('show')) {
      this.hide();
    } else {
      this.show();
    }
  }
}

export function initSideNav(): void {
  for (const sidenav of getElements<HTMLDivElement>('.sidenav')) {
    new SideNav(sidenav);
  }
}
