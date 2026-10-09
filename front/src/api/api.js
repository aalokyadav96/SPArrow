// ============================================================================
// API SERVICE MODULE (ES6 Functional Module)
// ============================================================================

let mockEvents = [
  {
    id: '1',
    title: 'Go Backend Systems Summit',
    description: 'Deep dive into microservices, NATS JetStream, and pgx optimization.',
    date: '2026-11-15',
    location: 'Online',
    type: 'conference',
  },
  {
    id: '2',
    title: 'Vanilla Web Performance Workshop',
    description: 'Building zero-framework SPAs with DOM abstractions and History API.',
    date: '2026-12-02',
    location: 'San Francisco, CA',
    type: 'workshop',
  },
  {
    id: '3',
    title: 'Distributed Databases Meetup',
    description: 'Exploring Postgres row locks, partition keys, and audit logging.',
    date: '2026-12-18',
    location: 'Austin, TX',
    type: 'meetup',
  },
];

export async function fetchEvents() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));
  return [...mockEvents];
}

export async function fetchEventById(id) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  return mockEvents.find((e) => e.id === id) || null;
}

export async function createEvent(eventData) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const newEvent = {
    ...eventData,
    id: Date.now().toString(),
  };
  mockEvents = [...mockEvents, newEvent];
  return newEvent;
}