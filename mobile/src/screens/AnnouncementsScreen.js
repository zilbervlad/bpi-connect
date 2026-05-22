import { View, Text, ScrollView } from "react-native";
import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { MessageCard } from "../components/MessageCard";

export function AnnouncementsScreen({ messages, onOpenMessage }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="ANNOUNCEMENTS"
        title="Company updates"
        subtitle="Important messages and operational updates from Boston Pie."
      />

      {messages.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No announcements yet</Text>
          <Text style={styles.emptyText}>Company announcements will show up here.</Text>
        </View>
      ) : (
        messages.map((message) => (
          <MessageCard key={message.id} message={message} onPress={() => onOpenMessage(message)} />
        ))
      )}
    </ScrollView>
  );
}
