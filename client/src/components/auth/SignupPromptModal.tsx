import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, MessageSquare } from "lucide-react";

interface SignupPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignUp: () => void;
  onContinueAsGuest: () => void;
}

export function SignupPromptModal({
  isOpen,
  onClose,
  onSignUp,
  onContinueAsGuest,
}: SignupPromptModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="signup-prompt-modal">
        <DialogHeader>
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Save Your Chat History</DialogTitle>
          <DialogDescription className="text-center">
            Your chat history will be saved when you create an account! Sign up now to keep your conversations and unlock all features.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Save and access your chat history anytime
            </p>
            <p className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Create and manage multiple conversations
            </p>
            <p className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Access your virtual portfolio
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            onClick={onSignUp}
            className="w-full gap-2"
            data-testid="button-signup-now"
          >
            <UserPlus className="w-4 h-4" />
            Sign Up Now
          </Button>
          <Button
            variant="ghost"
            onClick={onContinueAsGuest}
            className="w-full"
            data-testid="button-continue-guest"
          >
            Continue as Guest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
