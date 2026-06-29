/** Shared API shape returned by GET /api/notifications */
export interface ApiNotification {
  id: string;
  type: string;
  module: string;
  title: string;
  message: string;
  link: string;
  createdAt: string;
  roleTarget: string;
}

export interface ApiNotificationsResponse {
  notifications: ApiNotification[];
  role: string;
}
