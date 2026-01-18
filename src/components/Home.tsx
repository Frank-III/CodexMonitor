import { Button, Icon } from "../ui";

type HomeProps = {
  onOpenProject: () => void;
  onAddWorkspace: () => void;
  onCloneRepository: () => void;
};

export function Home(props: HomeProps) {
  return (
    <div class="flex flex-col items-center justify-center h-full px-4">
      <div class="flex flex-col items-center gap-3">
        <Icon name="folder-add-left" size="large" class="text-icon-base opacity-50" />
        <div class="flex flex-col gap-1 items-center justify-center">
          <div class="text-14-medium text-text-strong">No workspaces open</div>
          <div class="text-12-regular text-text-weak">Get started by opening a project</div>
        </div>
        <div class="h-2" />
        <Button icon="folder-add-left" onClick={props.onOpenProject}>
          Open project
        </Button>
      </div>
    </div>
  );
}
