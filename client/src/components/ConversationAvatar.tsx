import { Users } from 'lucide-react';
import { type Conversation, otherMember } from '../lib/messages';
import Avatar from './Avatar';

/** Avatar d'une conversation : photo de l'interlocuteur, ou pictogramme pour un groupe. */
export default function ConversationAvatar({
  conversation,
  meUid,
  className = 'w-12 h-12 text-base',
}: {
  conversation: Conversation;
  meUid: string;
  className?: string;
}) {
  if (conversation.type === 'group') {
    return (
      <div
        className={`rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex-shrink-0 flex items-center justify-center ${className}`}
      >
        <Users className="w-1/2 h-1/2" />
      </div>
    );
  }
  const other = otherMember(conversation, meUid);
  return <Avatar src={other?.avatar} name={other?.pseudo} className={className} />;
}
