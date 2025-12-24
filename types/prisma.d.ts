// Minimal Prisma client/type stubs for type-checking in sandboxed environments
// This mirrors the app schema at a high level but is not a functional client.
declare module '@prisma/client' {
  export type User = {
    id?: string;
    name?: string;
    email?: string;
    username?: string;
    emailOrUsername?: string;
    passwordHash?: string;
    avatarStorageKey?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    memberships?: FamilyMembership[];
    posts?: Post[];
    editedPosts?: Post[];
    comments?: Comment[];
    reactions?: Reaction[];
    cookedEvents?: CookedEvent[];
    favorites?: Favorite[];
    feedbackSubmissions?: FeedbackSubmission[];
  };

  export type FamilySpace = {
    id?: string;
    name?: string;
    masterKeyHash?: string;
    createdAt?: Date;
    updatedAt?: Date;
    memberships?: FamilyMembership[];
    posts?: Post[];
    feedbackSubmissions?: FeedbackSubmission[];
  };

  export type FamilyMembership = {
    id?: string;
    familySpaceId?: string;
    userId?: string;
    role?: string;
    createdAt?: Date;
    familySpace?: FamilySpace;
    user?: User;
  };

  export type PostPhoto = {
    id?: string;
    postId?: string;
    storageKey?: string;
    sortOrder?: number;
    createdAt?: Date;
  };

  export type RecipeDetails = {
    id?: string;
    postId?: string;
    origin?: string | null;
    ingredients?: string;
    steps?: string;
    totalTime?: number | null;
    servings?: number | null;
    course?: string | null;
    courses?: string | null;
    difficulty?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  };

  export type Tag = {
    id?: string;
    name?: string;
    type?: string | null;
    createdAt?: Date;
  };

  export type PostTag = {
    id?: string;
    postId?: string;
    tagId?: string;
    post?: Post;
    tag?: Tag;
  };

  export type Comment = {
    id?: string;
    postId?: string;
    authorId?: string;
    text?: string;
    photoStorageKey?: string | null;
    createdAt?: Date;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
    post?: Post;
    author?: User;
    reactions?: Reaction[];
  };

  export type Reaction = {
    id?: string;
    targetType?: string;
    targetId?: string;
    userId?: string;
    emoji?: string;
    postId?: string | null;
    commentId?: string | null;
    createdAt?: Date;
    user?: User;
    post?: Post | null;
    comment?: Comment | null;
  };

  export type CookedEvent = {
    id?: string;
    postId?: string;
    userId?: string;
    rating?: number | null;
    note?: string | null;
    createdAt?: Date;
    post?: Post;
    user?: User;
  };

  export type Favorite = {
    id?: string;
    userId?: string;
    postId?: string;
    createdAt?: Date;
    post?: Post;
    user?: User;
  };

  export type FeedbackSubmission = {
    id?: string;
    category?: 'bug' | 'suggestion';
    message?: string;
    contactEmail?: string | null;
    userId?: string | null;
    familySpaceId?: string | null;
    pageUrl?: string | null;
    userAgent?: string | null;
    createdAt?: Date;
    user?: User | null;
    familySpace?: FamilySpace | null;
  };

  export type Post = {
    id?: string;
    familySpaceId?: string;
    authorId?: string;
    title?: string;
    caption?: string | null;
    hasRecipeDetails?: boolean;
    mainPhotoStorageKey?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    lastEditedBy?: string | null;
    lastEditNote?: string | null;
    lastEditAt?: Date | null;
    photos?: PostPhoto[];
    recipeDetails?: RecipeDetails | null;
    tags?: PostTag[];
    comments?: Comment[];
    reactions?: Reaction[];
    cookedEvents?: CookedEvent[];
    favorites?: Favorite[];
    author?: User;
    editor?: User | null;
  };

  export namespace Prisma {
    export class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, code?: string, meta?: unknown);
    }
    export type PostWhereInput = any;
    export type IntFilter = any;
    export type PostFindManyArgs = any;
    export type PostGetPayload<T = any> = any;
  }

  type AnyDelegate<T = any> = {
    findMany(args?: any): Promise<any>;
    findFirst(args?: any): Promise<any>;
    findUnique(args?: any): Promise<any>;
    findUniqueOrThrow(args?: any): Promise<any>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<any>;
    delete(args: any): Promise<any>;
    deleteMany(args: any): Promise<any>;
    createMany(args: any): Promise<any>;
    upsert(args: any): Promise<any>;
    count(args?: any): Promise<any>;
    aggregate(args: any): Promise<any>;
    groupBy(args: any): Promise<any>;
  };

  export class PrismaClient {
    [key: string]: any;
    user: AnyDelegate;
    familySpace: AnyDelegate;
    familyMembership: AnyDelegate;
    post: AnyDelegate;
    postPhoto: AnyDelegate;
    postTag: AnyDelegate;
    recipeDetails: AnyDelegate;
    comment: AnyDelegate;
    reaction: AnyDelegate;
    cookedEvent: AnyDelegate;
    favorite: AnyDelegate;
    tag: AnyDelegate;
    feedbackSubmission: AnyDelegate;
    $queryRaw<T = any>(...args: any[]): Promise<T>;
    $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
    $disconnect(): Promise<void>;
  }
}
