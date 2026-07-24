import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { styles } from "../styles/styles";
import {
  deleteApiScheduleImage,
  fetchApiScheduleImages,
  fetchApiUserDetail,
  uploadApiScheduleImage,
} from "../api/client";
import { ZoomableImageModal } from "../components/ZoomableImageModal";

export function ScheduleScreen({ user, onBack }) {
  const normalizedRole = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  const canUpload = [
    "admin",
    "hr",
    "coach",
    "supervisor",
    "general_manager",
    "manager",
    "mit",
  ].includes(normalizedRole);

  const [userDetail, setUserDetail] = useState(null);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [weekStart, setWeekStart] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduleImages, setScheduleImages] = useState([]);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const assignedStores = useMemo(() => {
    const rows = [];

    if (userDetail?.store?.id) {
      rows.push({
        id: userDetail.store.id,
        store_number: userDetail.store.store_number,
        name: userDetail.store.name,
      });
    }

    for (const assignment of userDetail?.store_assignments || []) {
      const store = assignment.store;

      if (!store?.id || rows.some((item) => item.id === store.id)) {
        continue;
      }

      rows.push({
        id: store.id,
        store_number: store.store_number,
        name: store.name,
      });
    }

    return rows;
  }, [userDetail]);

  const visibleSchedules = useMemo(
    () =>
      selectedStoreId
        ? scheduleImages.filter(
            (item) => item.store_id === selectedStoreId
          )
        : scheduleImages,
    [scheduleImages, selectedStoreId]
  );

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedStoreId && assignedStores.length) {
      setSelectedStoreId(assignedStores[0].id);
    }
  }, [assignedStores, selectedStoreId]);

  useEffect(() => {
    if (selectedStoreId) {
      loadSchedules(selectedStoreId);
    }
  }, [selectedStoreId]);

  async function loadInitial() {
    setIsLoading(true);

    try {
      const detail = await fetchApiUserDetail(user.id, user.id);
      setUserDetail(detail);
    } catch (error) {
      Alert.alert(
        "Unable to load schedule",
        error?.message || "Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSchedules(storeId) {
    try {
      const rows = await fetchApiScheduleImages(
        user.id,
        storeId
      );
      setScheduleImages(rows);
    } catch (error) {
      Alert.alert(
        "Unable to load schedule",
        error?.message || "Please try again."
      );
    }
  }

  async function uploadAsset(asset) {
    if (!selectedStoreId || !weekStart.trim()) {
      Alert.alert(
        "Missing information",
        "Choose a store and enter the week start date."
      );
      return;
    }

    setIsUploading(true);

    try {
      const base64 = await FileSystem.readAsStringAsync(
        asset.uri,
        { encoding: "base64" }
      );

      const mimeType = asset.mimeType || "image/jpeg";
      const imageData = `data:${mimeType};base64,${base64}`;

      await uploadApiScheduleImage({
        actorUserId: user.id,
        storeId: selectedStoreId,
        weekStart: weekStart.trim(),
        imageData,
        mimeType,
        fileName: asset.fileName || "store-schedule.jpg",
        notes: notes.trim(),
      });

      setNotes("");
      await loadSchedules(selectedStoreId);

      Alert.alert(
        "Schedule posted",
        "The schedule is now available to the store team."
      );
    } catch (error) {
      Alert.alert(
        "Upload failed",
        error?.message || "Please try again."
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function takePhoto() {
    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Camera access needed",
        "Please allow camera access to photograph the schedule."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      await uploadAsset(result.assets[0]);
    }
  }

  async function choosePhoto() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Please allow photo access to select a schedule."
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });

    if (!result.canceled && result.assets?.[0]) {
      await uploadAsset(result.assets[0]);
    }
  }

  function confirmDelete(item) {
    Alert.alert(
      "Remove schedule?",
      `Remove the schedule for week of ${item.week_start}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteApiScheduleImage(
                item.id,
                user.id
              );
              await loadSchedules(selectedStoreId);
            } catch (error) {
              Alert.alert(
                "Unable to remove",
                error?.message || "Please try again."
              );
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <View style={localStyles.loading}>
        <ActivityIndicator size="large" />
        <Text style={localStyles.loadingText}>
          Loading schedules...
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={localStyles.content}
      >
        <TouchableOpacity onPress={onBack}>
          <Text style={localStyles.back}>‹ Back to Ops</Text>
        </TouchableOpacity>

        <Text style={localStyles.eyebrow}>OPS</Text>
        <Text style={localStyles.title}>Store Schedule</Text>
        <Text style={localStyles.subtitle}>
          View the latest POS schedule for your store.
        </Text>

        <View style={localStyles.storeRow}>
          {assignedStores.map((store) => (
            <TouchableOpacity
              key={store.id}
              style={[
                localStyles.storePill,
                selectedStoreId === store.id &&
                  localStyles.storePillActive,
              ]}
              onPress={() => setSelectedStoreId(store.id)}
            >
              <Text
                style={[
                  localStyles.storePillText,
                  selectedStoreId === store.id &&
                    localStyles.storePillTextActive,
                ]}
              >
                {store.store_number}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {canUpload ? (
          <View style={localStyles.card}>
            <Text style={localStyles.sectionTitle}>
              Post Schedule
            </Text>

            <Text style={localStyles.label}>
              Week starts
            </Text>
            <TextInput
              value={weekStart}
              onChangeText={setWeekStart}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#8191a1"
              style={localStyles.input}
            />

            <Text style={localStyles.label}>Note</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor="#8191a1"
              style={localStyles.input}
            />

            <View style={localStyles.uploadRow}>
              <TouchableOpacity
                style={localStyles.primaryButton}
                onPress={takePhoto}
                disabled={isUploading}
              >
                <Text style={localStyles.primaryText}>
                  {isUploading ? "Uploading..." : "Take Photo"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={localStyles.secondaryButton}
                onPress={choosePhoto}
                disabled={isUploading}
              >
                <Text style={localStyles.secondaryText}>
                  Choose Photo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <Text style={localStyles.sectionHeader}>
          Schedule History
        </Text>

        {visibleSchedules.length ? (
          visibleSchedules.map((item, index) => (
            <View key={item.id} style={localStyles.card}>
              <View style={localStyles.rowBetween}>
                <View>
                  <Text style={localStyles.scheduleTitle}>
                    Week of {item.week_start}
                  </Text>
                  <Text style={localStyles.meta}>
                    Uploaded by {item.uploaded_by?.name || "Manager"}
                  </Text>
                </View>

                {index === 0 ? (
                  <Text style={localStyles.latestBadge}>LATEST</Text>
                ) : null}
              </View>

              <TouchableOpacity
                onPress={() =>
                  setSelectedImageUri(item.image_url)
                }
                activeOpacity={0.88}
              >
                <Image
                  source={{
                    uri: item.thumbnail_url || item.image_url,
                  }}
                  resizeMode="contain"
                  style={localStyles.scheduleImage}
                />
              </TouchableOpacity>

              {item.notes ? (
                <Text style={localStyles.notes}>
                  {item.notes}
                </Text>
              ) : null}

              {canUpload ? (
                <TouchableOpacity
                  style={localStyles.removeButton}
                  onPress={() => confirmDelete(item)}
                >
                  <Text style={localStyles.removeText}>
                    Remove
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        ) : (
          <View style={localStyles.card}>
            <Text style={localStyles.empty}>
              No schedule has been posted for this store.
            </Text>
          </View>
        )}
      </ScrollView>

      <ZoomableImageModal
        visible={Boolean(selectedImageUri)}
        imageUri={selectedImageUri}
        onClose={() => setSelectedImageUri(null)}
      />
    </>
  );
}

const localStyles = StyleSheet.create({
  content: {
    padding: 12,
    paddingBottom: 110,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#617386",
    fontWeight: "700",
  },
  back: {
    color: "#e91f3f",
    fontWeight: "900",
    marginBottom: 14,
  },
  eyebrow: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: "#10212b",
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: "#687a8c",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5,
    marginBottom: 14,
  },
  storeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 12,
  },
  storePill: {
    backgroundColor: "#e8eef3",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  storePillActive: {
    backgroundColor: "#101d2d",
  },
  storePillText: {
    color: "#526476",
    fontWeight: "900",
  },
  storePillTextActive: {
    color: "#ffffff",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e4eaf0",
  },
  sectionTitle: {
    color: "#10212b",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 8,
  },
  sectionHeader: {
    color: "#10212b",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 9,
  },
  label: {
    color: "#526476",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
    marginBottom: 5,
  },
  input: {
    backgroundColor: "#f3f6f8",
    borderWidth: 1,
    borderColor: "#dce4eb",
    borderRadius: 13,
    minHeight: 44,
    paddingHorizontal: 12,
    color: "#10212b",
    fontWeight: "700",
  },
  uploadRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "900",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#e8eef3",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: "#10212b",
    fontWeight: "900",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  scheduleTitle: {
    color: "#10212b",
    fontSize: 16,
    fontWeight: "900",
  },
  meta: {
    color: "#8191a1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  latestBadge: {
    color: "#ffffff",
    backgroundColor: "#e91f3f",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: "900",
  },
  scheduleImage: {
    width: "100%",
    height: 360,
    backgroundColor: "#f1f4f7",
    borderRadius: 14,
    marginTop: 12,
  },
  notes: {
    color: "#526476",
    marginTop: 9,
    lineHeight: 18,
  },
  removeButton: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 8,
  },
  removeText: {
    color: "#b42318",
    fontWeight: "900",
  },
  empty: {
    color: "#687a8c",
    textAlign: "center",
    fontWeight: "700",
  },
});
