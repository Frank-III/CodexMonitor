// Theme and base styles
import "./colors.css";
import "./theme.css";
import "./base.css";
import "./animations.css";
import "./utilities.css";

// Component styles
import "./button.css";
import "./icon-button.css";
import "./icon.css";
import "./card.css";
import "./tabs.css";
import "./dropdown-menu.css";
import "./list.css";
import "./dialog.css";
import "./text-field.css";
import "./spinner.css";
import "./tooltip.css";
import "./popover.css";
import "./checkbox.css";
import "./switch.css";
import "./collapsible.css";
import "./tag.css";
import "./hover-card.css";
import "./select.css";
import "./radio-group.css";
import "./toast.css";
import "./accordion.css";
import "./keybind.css";
import "./avatar.css";
import "./resize-handle.css";
import "./progress-circle.css";
import "./inline-input.css";
import "./file-icon.css";
import "./image-preview.css";
import "./typewriter.css";
import "./basic-tool.css";
import "./diff-changes.css";
import "./message-part.css";
import "./session-turn.css";
import "./message-nav.css";
import "./skeleton.css";
import "./sticky-accordion-header.css";
import "./session-message-rail.css";
import "./session-review.css";
import "./todos-tool.css";
import "./terminal-tabs.css";

// Core Components
export { Button, type ButtonProps } from "./Button";
export { IconButton, type IconButtonProps } from "./IconButton";
export { Icon, type IconProps, iconNames } from "./Icon";
export { Card, type CardProps } from "./Card";
export { Spinner, type SpinnerProps } from "./Spinner";

// Layout & Navigation
export { Tabs, type TabsProps, type TabsListProps, type TabsTriggerProps, type TabsContentProps } from "./Tabs";
export { DropdownMenu } from "./DropdownMenu";
export { Collapsible, type CollapsibleProps } from "./Collapsible";
export { Accordion, type AccordionProps, type AccordionItemProps } from "./Accordion";
export { ResizeHandle, type ResizeHandleProps } from "./ResizeHandle";

// Overlays
export { Dialog, type DialogProps } from "./Dialog";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { Popover, type PopoverProps } from "./Popover";
export { HoverCard, type HoverCardProps } from "./HoverCard";
export { Toast, toaster, showToast, showPromiseToast, type ToastOptions, type ToastPromiseOptions, type ToastVariant } from "./Toast";

// List
export { List, type ListProps, type ListSearchProps, type ListRef } from "./List";

// Context
export { DialogProvider, useDialog, createSimpleContext } from "./context";

// Hooks
export { useFilteredList, type FilteredListProps } from "./hooks";
export { createAutoScroll, type AutoScrollOptions } from "./hooks";

// Form Controls
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { Switch, type SwitchProps } from "./Switch";
export { Select, type SelectProps } from "./Select";
export { RadioGroup, type RadioGroupProps } from "./RadioGroup";
export { TextField, type TextFieldProps } from "./TextField";
export { InlineInput, type InlineInputProps } from "./InlineInput";

// Display
export { DiffChanges } from "./DiffChanges";
export { Tag, type TagProps } from "./Tag";
export { Avatar, type AvatarProps } from "./Avatar";
export { Keybind, type KeybindProps } from "./Keybind";
export { ProgressCircle, type ProgressCircleProps } from "./ProgressCircle";
export { FileIcon, type FileIconProps } from "./FileIcon";
export { ImagePreview, type ImagePreviewProps } from "./ImagePreview";
export { Typewriter, type TypewriterProps } from "./Typewriter";

// Tools
export { BasicTool, type BasicToolProps } from "./BasicTool";
export { TodosTool, type TodosToolProps, type TodoItem } from "./TodosTool";

// Message Navigation
export { MessageNav, type MessageNavProps, type MessageNavEntry } from "./MessageNav";
export { SessionMessageRail, type SessionMessageRailProps } from "./SessionMessageRail";
export { StickyAccordionHeader } from "./StickyAccordionHeader";

// Session Review
export { SessionReview, type SessionReviewProps, type FileDiff } from "./SessionReview";

// Skeleton
export { Skeleton, SessionSkeleton, type SkeletonProps, type SessionSkeletonProps } from "./Skeleton";

// Theme
export { ThemeProvider, useTheme, type ColorScheme } from "./theme";
export type { DesktopTheme, ThemeSeedColors, ThemeVariant } from "./theme";
