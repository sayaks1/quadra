import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  applyRating,
  createSeedStore,
  DEFAULT_ANKI_CONFIG,
  dueCards,
  formatInterval,
  previewIntervals,
  shouldRequeueInSession,
  type Card,
  type QuadraStore,
  type Rating,
} from "@quadra/shared";

const API = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:43127";
const STORAGE_KEY = "quadra-mobile-v2";

type Screen = "home" | "study";

const colors = {
  field: "#E9E9E6",
  card: "#FBFBFA",
  oxblood: "#6E2F2F",
  stone: "#B5B2A9",
  ink: "#1C1B1A",
};

export default function App() {
  const [store, setStore] = useState<QuadraStore | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [queue, setQueue] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [syncLabel, setSyncLabel] = useState("Local");

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QuadraStore;
        if (!parsed.settings) {
          parsed.settings = {
            anki: {
              ...DEFAULT_ANKI_CONFIG,
              learningSteps: [...DEFAULT_ANKI_CONFIG.learningSteps],
              relearningSteps: [...DEFAULT_ANKI_CONFIG.relearningSteps],
            },
          };
        }
        setStore(parsed);
      } else {
        setStore(createSeedStore());
      }
      try {
        const res = await fetch(`${API}/api/store`);
        if (res.ok) {
          const remote = (await res.json()) as QuadraStore;
          if (remote.cards?.length) {
            if (!remote.settings) {
              remote.settings = {
                anki: {
                  ...DEFAULT_ANKI_CONFIG,
                  learningSteps: [...DEFAULT_ANKI_CONFIG.learningSteps],
                  relearningSteps: [...DEFAULT_ANKI_CONFIG.relearningSteps],
                },
              };
            }
            setStore(remote);
            setSyncLabel("Synced");
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
          }
        }
      } catch {
        setSyncLabel("Offline");
      }
    })();
  }, []);

  useEffect(() => {
    if (!store) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    const t = setTimeout(() => {
      void fetch(`${API}/api/store`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      })
        .then(() => setSyncLabel("Synced"))
        .catch(() => setSyncLabel("Offline"));
    }, 800);
    return () => clearTimeout(t);
  }, [store]);

  const config = store?.settings?.anki ?? DEFAULT_ANKI_CONFIG;
  const due = useMemo(
    () => (store ? dueCards(store.cards, new Date(), undefined, config) : []),
    [store, config],
  );

  if (!store) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.oxblood} />
      </View>
    );
  }

  if (screen === "study") {
    const current = queue[0];
    if (!current) {
      return (
        <SafeAreaView style={styles.root}>
          <View style={[styles.center, { flex: 1, padding: 24 }]}>
            <Text style={styles.serifTitle}>Done for today</Text>
            <Text style={styles.sub}>All due cards reviewed. Nice work.</Text>
            <Pressable
              style={[styles.pill, styles.pillDark]}
              onPress={() => setScreen("home")}
            >
              <Text style={styles.pillDarkText}>Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    const now = new Date();
    const intervals = previewIntervals(current, now, config);
    const rate = (rating: Rating) => {
      const updated = applyRating(current, rating, now, config);
      setStore({
        ...store,
        cards: store.cards.map((c) => (c.id === current.id ? updated : c)),
        reviews: [
          ...store.reviews,
          {
            id: `rev_${Date.now()}`,
            cardId: current.id,
            rating,
            reviewedAt: now.toISOString(),
            scheduledDays: updated.anki.intervalDays,
          },
        ],
      });
      setQueue((q) => {
        const rest = q.slice(1);
        if (shouldRequeueInSession(updated)) return [...rest, updated];
        return rest;
      });
      setRevealed(false);
    };

    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <View style={{ paddingHorizontal: 20, paddingTop: 12, flex: 1 }}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: "40%" }]} />
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.serifSmall}>
              {store.decks.find((d) => d.id === current.deckId)?.name ?? "Study"}
            </Text>
            <Text style={styles.caption}>{queue.length} left</Text>
          </View>

          <View style={styles.studyCard}>
            <Text style={styles.caption}>
              {current.anki.phase === "learning" || current.anki.phase === "relearning"
                ? `Learning · step ${current.anki.learningStep + 1}`
                : current.anki.reps === 0
                  ? "New"
                  : `Review · seen ${current.anki.reps} times`}
            </Text>
            <Text style={styles.cardTerm}>{current.term}</Text>
            {revealed ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.cardBack}>
                  {current.reading ? `${current.reading} — ` : ""}
                  {current.meaning}
                </Text>
              </>
            ) : null}
          </View>

          <View style={{ marginTop: "auto", paddingBottom: 24 }}>
            {!revealed ? (
              <Pressable
                style={[styles.pill, styles.pillDark, { width: "100%" }]}
                onPress={() => setRevealed(true)}
              >
                <Text style={styles.pillDarkText}>Show answer</Text>
              </Pressable>
            ) : (
              <View style={styles.rateRow}>
                {(["again", "hard", "good", "easy"] as Rating[]).map((key) => {
                  const label =
                    key === "again"
                      ? "Again"
                      : key === "hard"
                        ? "Hard"
                        : key === "good"
                          ? "Good"
                          : "Easy";
                  const primary = key === "good";
                  return (
                    <Pressable
                      key={key}
                      onPress={() => rate(key)}
                      style={[
                        styles.rateCircle,
                        primary ? styles.ratePrimary : styles.rateSoft,
                      ]}
                    >
                      <Text
                        style={[styles.rateLabel, primary && { color: "#fff" }]}
                      >
                        {label}
                      </Text>
                      <Text
                        style={[
                          styles.rateInterval,
                          primary && { color: "rgba(255,255,255,0.8)" },
                        ]}
                      >
                        {formatInterval(now, new Date(intervals[key]))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <View style={styles.rowBetween}>
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
            <Text style={styles.brand}>Quadra</Text>
          </View>
          <Text style={styles.caption}>{syncLabel}</Text>
        </View>

        <Text style={styles.heroCount}>{due.length}</Text>
        <Text style={styles.sub}>cards waiting</Text>

        <View style={{ marginTop: 28, gap: 10 }}>
          {store.decks
            .filter((d) => !d.deletedAt)
            .map((deck) => {
              const count = dueCards(store.cards, new Date(), deck.id, config).length;
              return (
                <Pressable
                  key={deck.id}
                  style={styles.deckRow}
                  onPress={() => {
                    setQueue(dueCards(store.cards, new Date(), deck.id, config));
                    setRevealed(false);
                    setScreen("study");
                  }}
                >
                  <Text style={styles.deckName}>{deck.name}</Text>
                  <Text style={styles.dueCount}>{count || "—"}</Text>
                </Pressable>
              );
            })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.pill, styles.pillDark, { width: "100%" }]}
          onPress={() => {
            setQueue(dueCards(store.cards, new Date(), undefined, config));
            setRevealed(false);
            setScreen("study");
          }}
          disabled={due.length === 0}
        >
          <Text style={styles.pillDarkText}>Study all decks</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.field },
  center: { alignItems: "center", justifyContent: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brand: { fontSize: 28, color: colors.ink, fontWeight: "400" },
  mark: {
    width: 14,
    height: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 1,
    backgroundColor: colors.ink,
  },
  heroCount: {
    marginTop: 28,
    fontSize: 72,
    lineHeight: 78,
    color: colors.ink,
    fontWeight: "300",
  },
  sub: { color: colors.stone, fontSize: 15, marginTop: 4 },
  caption: { color: colors.stone, fontSize: 12 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deckRow: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deckName: { fontSize: 18, color: colors.ink },
  dueCount: { fontSize: 14, color: colors.oxblood, fontWeight: "600" },
  footer: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 28,
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  pillDark: { backgroundColor: colors.ink },
  pillDarkText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(181,178,169,0.35)",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressFill: { height: "100%", backgroundColor: colors.oxblood },
  serifSmall: { fontSize: 16, color: colors.ink },
  serifTitle: { fontSize: 34, color: colors.ink, marginBottom: 8 },
  studyCard: {
    marginTop: 24,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 28,
    minHeight: 260,
  },
  cardTerm: { marginTop: 24, fontSize: 34, color: colors.ink },
  cardBack: { fontSize: 20, color: colors.ink, lineHeight: 28 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(181,178,169,0.5)",
    marginVertical: 24,
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rateCircle: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 78,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  ratePrimary: { backgroundColor: colors.oxblood },
  rateSoft: { backgroundColor: colors.card },
  rateLabel: { fontSize: 13, fontWeight: "600", color: colors.ink },
  rateInterval: { fontSize: 11, color: colors.stone, marginTop: 2 },
});
