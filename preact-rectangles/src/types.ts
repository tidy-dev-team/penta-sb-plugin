import { EventHandler } from "@create-figma-plugin/utilities";

export interface CreateAvatarHandler extends EventHandler {
  name: "CREATE_AVATAR";
  handler: (data: { props: Record<string, any>; componentName: string }) => void;
}

export interface CloseHandler extends EventHandler {
  name: "CLOSE";
  handler: () => void;
}

export interface AvatarCreatedHandler extends EventHandler {
  name: "AVATAR_CREATED";
  handler: () => void;
}