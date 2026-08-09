/** @fileoverview Exposes stable UI primitives without leaking library-specific APIs to features. */

export { Button, TextArea, TextInput } from './primitives';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipProvider,
} from './overlays';
export type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  TextAreaProps,
  TextInputProps,
} from './primitives';
export type { DialogContentProps, TooltipProps } from './overlays';
