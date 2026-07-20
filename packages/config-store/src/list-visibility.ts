import {
  ViewExposuresConfig,
  canSeeUserScopedResource,
  userDisplayName,
  type CustomList,
  type UserContext,
  type ViewExposure,
  type ViewExposuresConfig as ViewExposuresConfigType,
} from "@cardstack/core";

export const isCustomListId = (id: string): boolean => id.startsWith("cl-");

export function canSeeCustomList(list: CustomList, user: UserContext): boolean {
  return canSeeUserScopedResource(list, user);
}

/**
 * Scope one object's exposure config to the authenticated app user.
 * CRM saved-view rows remain workspace-visible; Cardstack custom-list rows are
 * visible when workspace-shared or created by the current user.
 */
export function scopeViewExposuresForUser(
  config: ViewExposuresConfigType,
  user: UserContext,
): ViewExposuresConfigType {
  const customLists = config.customLists.filter((list) => canSeeCustomList(list, user));
  const visibleCustomIds = new Set(customLists.map((list) => list.id));
  const views = config.views.filter(
    (view) => !isCustomListId(view.viewId) || visibleCustomIds.has(view.viewId),
  );
  return ViewExposuresConfig.parse({ ...config, views, customLists });
}

/**
 * Merge a user-scoped editor payload back into the full object config without
 * deleting private lists owned by other users. New custom lists are stamped
 * with the current app user; old pre-auth lists stay workspace-shared.
 */
export function mergeScopedViewExposures(
  existing: ViewExposuresConfigType | undefined,
  incoming: ViewExposuresConfigType,
  user: UserContext,
  now = new Date().toISOString(),
): ViewExposuresConfigType {
  const base =
    existing ??
    ViewExposuresConfig.parse({
      version: incoming.version,
      tenantId: incoming.tenantId,
      object: incoming.object,
      views: [],
      customLists: [],
    });
  const existingById = new Map(base.customLists.map((list) => [list.id, list]));
  const hiddenCustomLists = base.customLists.filter((list) => !canSeeCustomList(list, user));
  const hiddenCustomIds = new Set(hiddenCustomLists.map((list) => list.id));

  const customLists = [
    ...hiddenCustomLists,
    ...incoming.customLists
      .filter((list) => !hiddenCustomIds.has(list.id))
      .map((list) => stampCustomList(list, user, existingById.get(list.id), now)),
  ];
  const customIds = new Set(customLists.map((list) => list.id));
  const incomingCustomViews = incoming.views
    .filter((view) => isCustomListId(view.viewId) && customIds.has(view.viewId))
    .map((view) => ({ ...view }));
  const incomingCustomViewIds = new Set(incomingCustomViews.map((view) => view.viewId));
  const defaultCustomViews: ViewExposure[] = customLists
    .filter((list) => !incomingCustomViewIds.has(list.id) && !hiddenCustomIds.has(list.id))
    .map((list) => ({ viewId: list.id, exposed: true, aliases: [], isDefault: false }));

  return ViewExposuresConfig.parse({
    ...base,
    tenantId: incoming.tenantId,
    object: incoming.object,
    views: [
      ...base.views.filter((view) => isCustomListId(view.viewId) && hiddenCustomIds.has(view.viewId)),
      ...incoming.views.filter((view) => !isCustomListId(view.viewId)),
      ...incomingCustomViews,
      ...defaultCustomViews,
    ],
    customLists,
  });
}

function stampCustomList(
  list: CustomList,
  user: UserContext,
  existing: CustomList | undefined,
  now: string,
): CustomList {
  const isNew = !existing;
  const visibility =
    isNew && !list.createdByUserId ? "private" : (list.visibility ?? existing?.visibility ?? "private");
  return {
    ...list,
    visibility,
    createdByUserId: existing?.createdByUserId ?? user.userId,
    createdByName: existing?.createdByName ?? userDisplayName(user),
    ...(existing?.createdByEmail || user.email
      ? { createdByEmail: existing?.createdByEmail ?? user.email }
      : {}),
    createdAt: existing?.createdAt ?? list.createdAt ?? now,
    updatedAt: now,
  };
}
