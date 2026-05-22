import { ScrollView } from "react-native";
import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { MessageCard } from "../components/MessageCard";

export function InboxScreen({ messages, unreadCount, ackCount, onOpenMessage }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="INBOX"
        title="Messages"
        subtitle={`${unreadCount} unread · ${ackCount} need acknowledgement`}
      />

      {messages.map((message) => (
        <MessageCard key={message.id} message={message} onPress={() => onOpenMessage(message)} />
      ))}
    </ScrollView>
  );
}
