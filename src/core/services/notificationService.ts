import { FirestoreEngine } from '../firebase/firebaseConfig';
import type { AppNotification, AppRoute } from '../types';

// ============================================================================
// NOTIFICATION SERVICE (notifications)
// ============================================================================

export const NotificationService = {
  async create(params: {
    recipientId: string; // specific employeeId or 'ALL'
    title: string;
    message: string;
    route: AppRoute;
    actorName?: string;
  }): Promise<AppNotification> {
    const item: AppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recipientId: params.recipientId,
      title: params.title,
      message: params.message,
      route: params.route,
      read: false,
      createdAt: new Date().toISOString(),
      actorName: params.actorName,
    };

    await FirestoreEngine.setDocument('notifications', item.id, item);
    return item;
  },

  async markAsRead(notificationId: string): Promise<void> {
    await FirestoreEngine.updateDocument<AppNotification>('notifications', notificationId, {
      read: true,
    });
  },

  async markAllAsRead(employeeId: string, allNotifications: AppNotification[]): Promise<void> {
    const unread = allNotifications.filter(
      (n) => !n.read && (n.recipientId === employeeId || n.recipientId === 'ALL')
    );
    for (const n of unread) {
      await FirestoreEngine.updateDocument<AppNotification>('notifications', n.id, {
        read: true,
      });
    }
  },

  subscribeForEmployee(
    employeeId: string,
    callback: (notifications: AppNotification[]) => void
  ): () => void {
    return FirestoreEngine.subscribeCollection<AppNotification>('notifications', (items) => {
      const filtered = items
        .filter((n) => n.recipientId === employeeId || n.recipientId === 'ALL')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(filtered);
    });
  },
};
