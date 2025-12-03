import { formatDistanceToNow } from 'date-fns';

export type TimelineItemType =
  | 'post_created'
  | 'comment_added'
  | 'reaction_added'
  | 'cooked_logged'
  | 'post_edited';

export interface TimelineActor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TimelinePostSummary {
  id: string;
  title: string;
  mainPhotoUrl: string | null;
}

export interface PostCreatedItem {
  id: string;
  type: 'post_created';
  timestamp: Date;
  actor: TimelineActor;
  post: TimelinePostSummary;
}

export interface CommentAddedItem {
  id: string;
  type: 'comment_added';
  timestamp: Date;
  actor: TimelineActor;
  post: TimelinePostSummary;
  comment: {
    id: string;
    text: string;
  };
}

export interface ReactionAddedItem {
  id: string;
  type: 'reaction_added';
  timestamp: Date;
  actor: TimelineActor;
  post: TimelinePostSummary;
  reaction: {
    emoji: string;
  };
}

export interface CookedLoggedItem {
  id: string;
  type: 'cooked_logged';
  timestamp: Date;
  actor: TimelineActor;
  post: TimelinePostSummary;
  cooked: {
    rating: number | null;
    note: string | null;
  };
}

export interface PostEditedItem {
  id: string;
  type: 'post_edited';
  timestamp: Date;
  actor: TimelineActor;
  post: TimelinePostSummary;
  edit: {
    note: string | null;
  };
}

export type TimelineItem =
  | PostCreatedItem
  | CommentAddedItem
  | ReactionAddedItem
  | CookedLoggedItem
  | PostEditedItem;

export function formatRelativeTime(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

export function getActionText(type: TimelineItemType): string {
  switch (type) {
    case 'post_created':
      return 'posted';
    case 'comment_added':
      return 'commented on';
    case 'reaction_added':
      return 'reacted to';
    case 'cooked_logged':
      return 'cooked';
    case 'post_edited':
      return 'updated';
    default:
      return 'shared';
  }
}

export function getActorInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}
