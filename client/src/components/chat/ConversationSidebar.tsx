import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Plus, MessageSquare, Trash2, Pencil, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { Conversation, Message } from "@shared/schema";

interface ConversationWithMeta extends Conversation {
  messageCount?: number;
}

interface ConversationSidebarProps {
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}

function DeleteConversationModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  conversationTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  conversationTitle: string;
}) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent data-testid="delete-conversation-modal">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{conversationTitle}"? This action cannot be undone and all messages in this conversation will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            data-testid="button-cancel-delete"
            disabled={isDeleting}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-confirm-delete"
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RenameConversationDialog({
  isOpen,
  onClose,
  onConfirm,
  isRenaming,
  currentTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newTitle: string) => void;
  isRenaming: boolean;
  currentTitle: string;
}) {
  const [title, setTitle] = useState(currentTitle);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onConfirm(title.trim());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-testid="rename-conversation-dialog">
        <DialogHeader>
          <DialogTitle>Rename Conversation</DialogTitle>
          <DialogDescription>
            Enter a new title for this conversation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Input
            data-testid="input-conversation-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Conversation title"
            className="mb-4"
            autoFocus
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isRenaming}
              data-testid="button-cancel-rename"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isRenaming || !title.trim()}
              data-testid="button-confirm-rename"
            >
              {isRenaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  conversation: ConversationWithMeta;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const formattedDate = conversation.updatedAt
    ? formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: true })
    : "";

  return (
    <SidebarMenuItem>
      <div className="group flex items-center w-full">
        <SidebarMenuButton
          data-testid={`conversation-item-${conversation.id}`}
          onClick={onSelect}
          isActive={isActive}
          className="flex-1 min-w-0"
        >
          <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0 w-full">
              <MessageSquare className="h-4 w-4 flex-shrink-0" />
              <span className="truncate text-sm flex-1">
                {conversation.title || "New Chat"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-6">
              {formattedDate && <span>{formattedDate}</span>}
              {conversation.messageCount !== undefined && conversation.messageCount > 0 && (
                <>
                  <span>·</span>
                  <span>{conversation.messageCount} {conversation.messageCount === 1 ? "message" : "messages"}</span>
                </>
              )}
            </div>
          </div>
        </SidebarMenuButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0 ml-1"
              data-testid={`button-conversation-menu-${conversation.id}`}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={onRename}
              data-testid={`button-rename-${conversation.id}`}
            >
              <Pencil className="h-3 w-3 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
              data-testid={`button-delete-${conversation.id}`}
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuItem>
  );
}

export function ConversationSidebar({
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: ConversationSidebarProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithMeta | null>(null);

  const { data: conversations, isLoading } = useQuery<ConversationWithMeta[]>({
    queryKey: ["/api/conversations"],
  });

  const sortedConversations = conversations
    ? [...conversations].sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      })
    : [];

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setDeleteModalOpen(false);
      setSelectedConversation(null);
      if (selectedConversation && activeConversationId === selectedConversation.id) {
        onNewChat();
      }
    },
  });

  const renameConversation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return await apiRequest("PUT", `/api/conversations/${id}/title`, { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setRenameDialogOpen(false);
      setSelectedConversation(null);
    },
  });

  const handleDeleteClick = (conversation: ConversationWithMeta) => {
    setSelectedConversation(conversation);
    setDeleteModalOpen(true);
  };

  const handleRenameClick = (conversation: ConversationWithMeta) => {
    setSelectedConversation(conversation);
    setRenameDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedConversation) {
      deleteConversation.mutate(selectedConversation.id);
    }
  };

  const handleConfirmRename = (newTitle: string) => {
    if (selectedConversation) {
      renameConversation.mutate({ id: selectedConversation.id, title: newTitle });
    }
  };

  return (
    <div data-testid="conversation-sidebar" className="flex flex-col h-full">
      <div className="p-2">
        <Button
          data-testid="button-new-chat"
          onClick={onNewChat}
          variant="outline"
          className="w-full justify-start gap-2"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <SidebarGroup>
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading && (
                <>
                  <SidebarMenuItem>
                    <div className="p-2">
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <div className="p-2">
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <div className="p-2">
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </SidebarMenuItem>
                </>
              )}

              {!isLoading && sortedConversations.length === 0 && (
                <div 
                  className="px-2 py-4 text-center"
                  data-testid="empty-conversations-state"
                >
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    No conversations yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start a new chat to begin
                  </p>
                </div>
              )}

              {sortedConversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={activeConversationId === conversation.id}
                  onSelect={() => onSelectConversation(conversation.id)}
                  onDelete={() => handleDeleteClick(conversation)}
                  onRename={() => handleRenameClick(conversation)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </ScrollArea>

      <DeleteConversationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedConversation(null);
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteConversation.isPending}
        conversationTitle={selectedConversation?.title || "New Chat"}
      />

      <RenameConversationDialog
        isOpen={renameDialogOpen}
        onClose={() => {
          setRenameDialogOpen(false);
          setSelectedConversation(null);
        }}
        onConfirm={handleConfirmRename}
        isRenaming={renameConversation.isPending}
        currentTitle={selectedConversation?.title || ""}
      />
    </div>
  );
}
