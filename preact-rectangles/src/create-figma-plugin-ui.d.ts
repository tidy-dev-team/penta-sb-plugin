declare module '@create-figma-plugin/ui' {
  import { ComponentChildren } from 'preact';
  import { JSX } from 'preact/jsx-runtime';

  export interface DropdownOption {
    value: string;
    text?: string;
  }

  export interface ButtonProps {
    fullWidth?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    secondary?: boolean;
    children?: ComponentChildren;
  }

  export interface TextboxMultilineProps {
    onInput?: (event: JSX.TargetedEvent<HTMLTextAreaElement>) => void;
    value?: string;
    rows?: number;
    placeholder?: string;
    disabled?: boolean;
  }

  export interface DropdownProps {
    onChange?: (event: JSX.TargetedEvent<HTMLInputElement>) => void;
    options: Array<DropdownOption>;
    value?: string;
  }

  export interface ContainerProps {
    space?: 'extraSmall' | 'small' | 'medium' | 'large' | 'extraLarge';
    children?: ComponentChildren;
  }

  export interface ColumnsProps {
    space?: 'extraSmall' | 'small' | 'medium' | 'large' | 'extraLarge';
    children?: ComponentChildren;
  }

  export interface VerticalSpaceProps {
    space?: 'extraSmall' | 'small' | 'medium' | 'large' | 'extraLarge';
  }

  export interface TextProps {
    children?: ComponentChildren;
  }

  export interface MutedProps {
    children?: ComponentChildren;
  }

  export const Button: preact.FunctionComponent<ButtonProps>;
  export const Columns: preact.FunctionComponent<ColumnsProps>;
  export const Container: preact.FunctionComponent<ContainerProps>;
  export const Muted: preact.FunctionComponent<MutedProps>;
  export const Text: preact.FunctionComponent<TextProps>;
  export const TextboxMultiline: preact.FunctionComponent<TextboxMultilineProps>;
  export const VerticalSpace: preact.FunctionComponent<VerticalSpaceProps>;
  export const LoadingIndicator: preact.FunctionComponent<{}>;
  export const Dropdown: preact.FunctionComponent<DropdownProps>;

  export function render(Plugin: preact.ComponentType): void;
}
