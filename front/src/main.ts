import { fetchEvents, fetchEventById, createEvent } from './api/api.js';

// ============================================================================
// 1. TYPES & MODELS
// ============================================================================
export interface EventItem {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  type: 'conference' | 'meetup' | 'workshop';
}

export type ViewMode = 'grid' | 'list';

export interface AppState {
  events: EventItem[];
  selectedEvent: EventItem | null;
  viewMode: ViewMode;
  loading: boolean;
}

export type RouteHandler = (params: Record<string, string>) => HTMLElement | Promise<HTMLElement>;

// ============================================================================
// 2. PUB / SUB STATE STORE (Factory Function)
// ============================================================================
export function createStore<T extends object>(initialState: T) {
  const subscribers = new Map<keyof T | 'global', Set<Function>>();

  const state = new Proxy(initialState, {
    set(target, property: string, value) {
      const key = property as keyof T;
      if (target[key] !== value) {
        (target as any)[key] = value;
        notify(key, value);
        notify('global' as any, target);
      }
      return true;
    },
  });

  function notify(key: keyof T | 'global', value: any) {
    const callbacks = subscribers.get(key);
    if (callbacks) {
      callbacks.forEach((cb) => cb(value));
    }
  }

  function getState(): T {
    return state;
  }

  function setState(partialState: Partial<T>): void {
    Object.assign(state, partialState);
  }

  function subscribe(key: keyof T | 'global', callback: Function): () => void {
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    subscribers.get(key)!.add(callback);

    return () => {
      subscribers.get(key)?.delete(callback);
    };
  }

  return { getState, setState, subscribe };
}

export const store = createStore<AppState>({
  events: [],
  selectedEvent: null,
  viewMode: 'grid',
  loading: false,
});

// ============================================================================
// 3. HISTORY API ROUTER (Functional Factory - Persistent Shell Target)
// ============================================================================
interface Route {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export function createRouter(contentElement: HTMLElement) {
  const routes: Route[] = [];

  function addRoute(path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const regexPath = path.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    const pattern = new RegExp(`^${regexPath}$`);
    routes.push({ pattern, paramNames, handler });
  }

  function navigate(url: string): void {
    window.history.pushState(null, '', url);
    handleRoute();
  }

  async function handleRoute(): Promise<void> {
    const pathname = window.location.pathname;

    for (const route of routes) {
      const match = pathname.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, idx) => {
          params[name] = match[idx + 1];
        });

        // Clear ONLY <main> element content, leaving shell intact
        contentElement.innerHTML = '';
        const pageElement = await route.handler(params);
        contentElement.appendChild(pageElement);
        updateActiveNavLinks(pathname);
        return;
      }
    }

    contentElement.innerHTML = '';
    contentElement.appendChild(createElement('h1', { textContent: '404 - Page Not Found' }));
  }

  function updateActiveNavLinks(pathname: string): void {
    document.querySelectorAll('nav a[data-link]').forEach((anchor) => {
      if (anchor.getAttribute('href') === pathname) {
        anchor.classList.add('active');
      } else {
        anchor.classList.remove('active');
      }
    });
  }

  // Bind browser navigation listeners
  window.addEventListener('popstate', handleRoute);
  document.body.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('a[data-link]');
    if (target) {
      e.preventDefault();
      const href = target.getAttribute('href');
      if (href) navigate(href);
    }
  });

  return { addRoute, navigate };
}

// ============================================================================
// 4. UI CORE & UTILITIES (createElement Helper)
// ============================================================================
export interface ElementProps {
  className?: string;
  textContent?: string;
  innerHTML?: string;
  attributes?: Record<string, string>;
  events?: Record<string, EventListener>;
  children?: (HTMLElement | string)[];
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (props.className) el.className = props.className;
  if (props.textContent) el.textContent = props.textContent;
  if (props.innerHTML) el.innerHTML = props.innerHTML;

  if (props.attributes) {
    Object.entries(props.attributes).forEach(([k, v]) => el.setAttribute(k, v));
  }

  if (props.events) {
    Object.entries(props.events).forEach(([event, listener]) => {
      el.addEventListener(event, listener);
    });
  }

  if (props.children) {
    props.children.forEach((child) => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    });
  }

  return el;
}

// ============================================================================
// 5. UI COMPONENTS (Functional Components)
// ============================================================================

export function Button(props: {
  text: string;
  onClick: (e: MouseEvent) => void;
  variant?: 'primary' | 'secondary';
  className?: string;
}): HTMLButtonElement {
  const variantClass = props.variant === 'secondary' ? 'btn-secondary' : '';
  return createElement('button', {
    className: `btn ${variantClass} ${props.className || ''}`.trim(),
    textContent: props.text,
    events: { click: props.onClick as EventListener },
  });
}

export function Modal(props: { title: string; content: HTMLElement; onClose: () => void }): HTMLElement {
  const modalHeader = createElement('div', {
    className: 'modal-header',
    children: [
      createElement('h2', { textContent: props.title }),
      Button({ text: '✕', variant: 'secondary', onClick: props.onClose }),
    ],
  });

  const modalBody = createElement('div', {
    children: [modalHeader, props.content],
  });

  const modalContainer = createElement('div', {
    className: 'modal',
    children: [modalBody],
  });

  const backdrop = createElement('div', {
    className: 'modal-backdrop',
    children: [modalContainer],
    events: {
      click: (e) => {
        if (e.target === backdrop) props.onClose();
      },
    },
  });

  return backdrop;
}

export function Form(props: {
  fields: { name: string; label: string; type: string; required?: boolean }[];
  onSubmit: (data: Record<string, string>) => void;
  submitText: string;
}): HTMLFormElement {
  const fieldElements = props.fields.map((f) => {
    const input = createElement('input', {
      attributes: { name: f.name, type: f.type, ...(f.required ? { required: 'true' } : {}) },
    });

    return createElement('div', {
      className: 'form-group',
      children: [createElement('label', { textContent: f.label }), input],
    });
  });

  const submitBtn = Button({ text: props.submitText, onClick: () => {} });
  submitBtn.type = 'submit';

  const formEl = createElement('form', {
    children: [...fieldElements, submitBtn],
    events: {
      submit: (e) => {
        e.preventDefault();
        const formData = new FormData(formEl);
        const data: Record<string, string> = {};
        formData.forEach((val, key) => {
          data[key] = val.toString();
        });
        props.onSubmit(data);
      },
    },
  });

  return formEl;
}

// ============================================================================
// 6. DOMAIN CARDS & TOGGLE
// ============================================================================

export function ThisCard(event: EventItem): HTMLElement {
  return createElement('div', {
    className: 'card',
    children: [
      createElement('div', {
        children: [
          createElement('span', {
            textContent: `[${event.type.toUpperCase()}]`,
            attributes: { style: 'font-size:0.75rem; color: var(--primary); font-weight: bold;' },
          }),
          createElement('h3', { textContent: event.title }),
          createElement('p', { textContent: event.description }),
        ],
      }),
      createElement('div', {
        children: [
          createElement('small', {
            textContent: `📅 ${event.date} | 📍 ${event.location}`,
            attributes: { style: 'display:block; margin-bottom: 0.75rem;' },
          }),
          createElement('a', {
            textContent: 'View Details →',
            className: 'btn btn-secondary',
            attributes: { href: `/event/${event.id}`, 'data-link': 'true', style: 'text-decoration:none; display:inline-block;' },
          }),
        ],
      }),
    ],
  });
}

export function ThatCard(event: EventItem): HTMLElement {
  return createElement('div', {
    className: 'card',
    attributes: { style: 'border-left: 4px solid var(--primary);' },
    children: [
      createElement('h3', { textContent: event.title }),
      createElement('p', { textContent: `Type: ${event.type} | Date: ${event.date}` }),
      createElement('a', {
        textContent: 'Open Event',
        attributes: { href: `/event/${event.id}`, 'data-link': 'true', style: 'color: var(--primary);' },
      }),
    ],
  });
}

export function ListGridToggle(): HTMLElement {
  const gridBtn = Button({
    text: 'Grid View',
    variant: store.getState().viewMode === 'grid' ? 'primary' : 'secondary',
    onClick: () => store.setState({ viewMode: 'grid' }),
  });

  const listBtn = Button({
    text: 'List View',
    variant: store.getState().viewMode === 'list' ? 'primary' : 'secondary',
    onClick: () => store.setState({ viewMode: 'list' }),
  });

  const container = createElement('div', {
    attributes: { style: 'display: flex; gap: 0.5rem;' },
    children: [gridBtn, listBtn],
  });

  store.subscribe('viewMode', (mode: ViewMode) => {
    gridBtn.className = `btn ${mode === 'grid' ? '' : 'btn-secondary'}`;
    listBtn.className = `btn ${mode === 'list' ? '' : 'btn-secondary'}`;
  });

  return container;
}

// ============================================================================
// 7. LAYOUT & PERSISTENT SHELL
// ============================================================================

export function Header(): HTMLElement {
  return createElement('header', {
    children: [
      createElement('h2', { textContent: '⚡ DevEvents' }),
      Nav(),
    ],
  });
}

export function Nav(): HTMLElement {
  return createElement('nav', {
    children: [
      createElement('a', { textContent: 'Home', attributes: { href: '/', 'data-link': 'true' } }),
      createElement('a', { textContent: 'Events', attributes: { href: '/events', 'data-link': 'true' } }),
      createElement('a', { textContent: 'About', attributes: { href: '/about', 'data-link': 'true' } }),
    ],
  });
}

export function Aside(): HTMLElement {
  return createElement('aside', {
    children: [
      createElement('h4', { textContent: 'Quick Actions' }),
      createElement('p', { textContent: 'Manage application events directly.', attributes: { style: 'font-size: 0.85rem; color: var(--text-muted);' } }),
      Button({
        text: '+ Add New Event',
        onClick: () => {
          const modalRoot = createElement('div');
          const closeModal = () => modalRoot.remove();

          const form = Form({
            fields: [
              { name: 'title', label: 'Event Title', type: 'text', required: true },
              { name: 'description', label: 'Description', type: 'text', required: true },
              { name: 'date', label: 'Date', type: 'date', required: true },
              { name: 'location', label: 'Location', type: 'text', required: true },
            ],
            submitText: 'Create Event',
            onSubmit: async (data) => {
              const newEvt = await createEvent({
                title: data.title,
                description: data.description,
                date: data.date,
                location: data.location,
                type: 'meetup',
              });
              
              // Reactive store update triggers re-render of list
              const currentList = store.getState().events;
              store.setState({ events: [...currentList, newEvt] });
              closeModal();
            },
          });

          const modal = Modal({ title: 'Add Event', content: form, onClose: closeModal });
          modalRoot.appendChild(modal);
          document.body.appendChild(modalRoot);
        },
      }),
    ],
  });
}

export function Footer(): HTMLElement {
  return createElement('footer', {
    children: [createElement('p', { textContent: 'Built with Vanilla Functional TypeScript & ES6 Modules' })],
  });
}

export function createLayoutShell(): { shell: HTMLElement; mainContent: HTMLElement } {
  const mainContent = createElement('main');
  const bodyWrapper = createElement('div', {
    className: 'layout-body',
    children: [Aside(), mainContent],
  });

  const shell = createElement('div', {
    attributes: { style: 'display: flex; flex-direction: column; min-height: 100vh;' },
    children: [Header(), bodyWrapper, Footer()],
  });

  return { shell, mainContent };
}

// ============================================================================
// 8. PAGES (Functions returning HTMLElements)
// ============================================================================

export function HomePage(): HTMLElement {
  return createElement('div', {
    children: [
      createElement('h1', { textContent: 'Welcome to DevEvents' }),
      createElement('p', { textContent: 'A light-weight single page app platform without framework overhead.', attributes: { style: 'margin-top: 1rem;' } }),
      createElement('div', {
        attributes: { style: 'margin-top: 2rem;' },
        children: [
          createElement('a', {
            textContent: 'Explore Events →',
            className: 'btn',
            attributes: { href: '/events', 'data-link': 'true', style: 'text-decoration:none;' },
          }),
        ],
      }),
    ],
  });
}

export async function EventsPage(): Promise<HTMLElement> {
  const data = await fetchEvents();
  store.setState({ events: data as EventItem[] });

  const headerControls = createElement('div', {
    attributes: { style: 'display: flex; justify-content: space-between; align-items: center;' },
    children: [createElement('h1', { textContent: 'Upcoming Events' }), ListGridToggle()],
  });

  const cardsContainer = createElement('div', {
    className: store.getState().viewMode === 'grid' ? 'card-grid' : 'card-list',
  });

  const renderCards = (mode: ViewMode, list: EventItem[]) => {
    cardsContainer.className = mode === 'grid' ? 'card-grid' : 'card-list';
    cardsContainer.innerHTML = '';
    list.forEach((evt) => {
      const cardEl = mode === 'grid' ? ThisCard(evt) : ThatCard(evt);
      cardsContainer.appendChild(cardEl);
    });
  };

  renderCards(store.getState().viewMode, store.getState().events);

  // Dynamic state bindings
  store.subscribe('events', (updatedEvents: EventItem[]) => {
    renderCards(store.getState().viewMode, updatedEvents);
  });

  store.subscribe('viewMode', (mode: ViewMode) => {
    renderCards(mode, store.getState().events);
  });

  return createElement('div', {
    children: [headerControls, cardsContainer],
  });
}

export async function EventDetailPage(params: Record<string, string>): Promise<HTMLElement> {
  const event = await fetchEventById(params.eventID);

  if (!event) {
    return createElement('h1', { textContent: 'Event Not Found' });
  }

  return createElement('div', {
    children: [
      createElement('a', {
        textContent: '← Back to Events',
        attributes: { href: '/events', 'data-link': 'true', style: 'color: var(--primary); font-weight: bold;' },
      }),
      createElement('h1', { textContent: event.title, attributes: { style: 'margin-top: 1rem;' } }),
      createElement('p', { textContent: `Type: ${event.type} | Date: ${event.date} | Location: ${event.location}`, attributes: { style: 'color: var(--text-muted); margin: 0.5rem 0 1.5rem 0;' } }),
      createElement('div', {
        className: 'card',
        children: [createElement('p', { textContent: event.description })],
      }),
    ],
  });
}

export function AboutPage(): HTMLElement {
  return createElement('div', {
    children: [
      createElement('h1', { textContent: 'About This Architecture' }),
      createElement('p', {
        textContent: 'This application utilizes native ES6 Modules, closure-based Pub/Sub store factories, dynamic History API routing, and component functions.',
        attributes: { style: 'margin-top: 1rem; color: var(--text-muted);' },
      }),
    ],
  });
}

// ============================================================================
// 9. APPLICATION INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;

  // 1. Mount layout shell once
  const { shell, mainContent } = createLayoutShell();
  appRoot.appendChild(shell);

  // 2. Initialize router linked exclusively to <main>
  const router = createRouter(mainContent);

  // 3. Register static & dynamic routes
  router.addRoute('/', () => HomePage());
  router.addRoute('/events', () => EventsPage());
  router.addRoute('/event/:eventID', (params) => EventDetailPage(params));
  router.addRoute('/about', () => AboutPage());

  // 4. Initial trigger
  router.navigate(window.location.pathname);
});