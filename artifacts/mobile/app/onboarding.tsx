import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { aiService } from '@/lib/aiService';
import { getCvContent } from '@/utils/docContext';
import { extractPartialProfile, extractProfileComplete, cleanMarkdown } from '@/utils/markerParser';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_KEY = 'cc_profile_chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProfileSnapshot {
  displayName?: string;
  currentDegree?: string;
  institution?: string;
  yearOfStudy?: string;
  skills?: string;
  city?: string;
  preferredIndustries?: string;
  careerGoals?: string;
  portfolioUrl?: string;
  profileFields?: Array<{ label: string; value: string }>;
}

// Strip markdown/special chars the AI sometimes adds
function cleanAiResponse(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
}

// ─── Voice input ──────────────────────────────────────────────────────────────

function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const supported =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );

  const toggleListening = useCallback(() => {
    if (!supported) return;
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-ZM';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) =>
      onTranscript(event.results[0][0].transcript);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [supported, isListening, onTranscript]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { isListening, toggleListening, supported };
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots({ colors }: { colors: ReturnType<typeof useColors> }) {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.delay(540 - i * 180),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 6,
        paddingHorizontal: 2,
      }}
    >
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: colors.primary,
            opacity: dot,
          }}
        />
      ))}
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  colors,
  index,
  isLastUser,
  onEdit,
}: {
  msg: ChatMessage;
  colors: ReturnType<typeof useColors>;
  index: number;
  isLastUser?: boolean;
  onEdit?: () => void;
}) {
  const isAI = msg.role === 'assistant';
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        delay: index === 0 ? 200 : 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        delay: index === 0 ? 200 : 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        { opacity, transform: [{ translateY }] },
        isAI
          ? { alignSelf: 'flex-start', maxWidth: '85%' }
          : { alignSelf: 'flex-end', maxWidth: '80%' },
        { marginBottom: 12 },
      ]}
    >
      {isAI && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 5,
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 10, color: '#fff' }}>✦</Text>
          </View>
          <Text
            style={{
              fontSize: 11,
              fontFamily: 'Inter_600SemiBold',
              color: colors.primary,
              letterSpacing: 0.5,
            }}
          >
            CAREER COMPASS AI
          </Text>
        </View>
      )}
      <View
        style={
          isAI
            ? {
                backgroundColor: colors.indigoBg,
                borderColor: colors.indigoBorder,
                borderWidth: 1,
                borderRadius: 18,
                borderTopLeftRadius: 4,
                paddingHorizontal: 16,
                paddingVertical: 13,
              }
            : {
                backgroundColor: colors.mutedStrong,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 18,
                borderTopRightRadius: 4,
                paddingHorizontal: 16,
                paddingVertical: 13,
              }
        }
      >
        <Text
          style={{
            fontSize: 15,
            fontFamily: 'Inter_400Regular',
            color: colors.text,
            lineHeight: 22,
          }}
        >
          {msg.content}
        </Text>
      </View>
      {!isAI && isLastUser && onEdit && (
        <Pressable
          onPress={onEdit}
          style={{
            alignSelf: 'flex-end',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginTop: 5,
            paddingVertical: 3,
            paddingHorizontal: 6,
          }}
          hitSlop={8}
        >
          <Feather name="edit-2" size={11} color={colors.textMuted} />
          <Text
            style={{
              fontSize: 11,
              fontFamily: 'Inter_400Regular',
              color: colors.textMuted,
            }}
          >
            Edit
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─── Floating profile panel ───────────────────────────────────────────────────

function FloatingProfilePanel({
  snapshot,
  onSave,
  colors,
}: {
  snapshot: ProfileSnapshot;
  onSave: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY()).current;
  const isDragging = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        isDragging.current = true;
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        setTimeout(() => {
          isDragging.current = false;
        }, 50);
      },
    }),
  ).current;

  const fields = snapshot.profileFields ?? [];
  const fieldCount = fields.filter(f => f.value?.trim()).length;

  const lastCount = useRef(0);
  useEffect(() => {
    if (fieldCount > lastCount.current) {
      lastCount.current = fieldCount;
      Animated.sequence([
        Animated.timing(badgeScale, {
          toValue: 1.3,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(badgeScale, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [fieldCount]);

  const toggleExpanded = useCallback(() => {
    if (isDragging.current) return;
    const toValue = expanded ? 0 : 1;
    Animated.spring(expandAnim, {
      toValue,
      useNativeDriver: false,
      tension: 70,
      friction: 12,
    }).start();
    setExpanded(!expanded);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [expanded]);

  const panelHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 340],
  });
  const panelOpacity = expandAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <Animated.View
      style={[
        floatStyles.container,
        { transform: pan.getTranslateTransform() },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          floatStyles.panel,
          {
            height: panelHeight,
            overflow: 'hidden',
            backgroundColor: colors.card,
            borderColor: colors.indigoBorder,
          },
        ]}
      >
        <Animated.View style={{ opacity: panelOpacity, flex: 1 }}>
          <View
            style={[
              floatStyles.panelHeader,
              { borderBottomColor: colors.divider },
            ]}
            {...panResponder.panHandlers}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ gap: 3 }}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {[0, 1, 2].map(i => (
                    <View
                      key={i}
                      style={{
                        width: 3,
                        height: 3,
                        borderRadius: 1.5,
                        backgroundColor: colors.textMuted,
                      }}
                    />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {[0, 1, 2].map(i => (
                    <View
                      key={i}
                      style={{
                        width: 3,
                        height: 3,
                        borderRadius: 1.5,
                        backgroundColor: colors.textMuted,
                      }}
                    />
                  ))}
                </View>
              </View>
              <View
                style={[
                  floatStyles.headerDot,
                  { backgroundColor: colors.primary },
                ]}
              />
              <Text
                style={[floatStyles.panelTitle, { color: colors.text }]}
              >
                Profile Preview
              </Text>
            </View>
            <Pressable onPress={toggleExpanded} hitSlop={8}>
              <Feather
                name="chevron-down"
                size={16}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 14,
              paddingBottom: 8,
            }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {fields
              .filter(f => f.value?.trim())
              .map((field, i) => (
                <View
                  key={i}
                  style={[
                    floatStyles.fieldRow,
                    { borderBottomColor: colors.divider },
                  ]}
                >
                  <Text
                    style={[
                      floatStyles.fieldLabel,
                      { color: colors.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {field.label}
                  </Text>
                  <Text
                    style={[
                      floatStyles.fieldValue,
                      { color: colors.text },
                    ]}
                    numberOfLines={2}
                  >
                    {field.value}
                  </Text>
                </View>
              ))}
            {fieldCount === 0 && (
              <Text
                style={[
                  floatStyles.emptyText,
                  { color: colors.textMuted },
                ]}
              >
                Keep chatting — your info will appear here in real time.
              </Text>
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
            <Pressable
              style={[
                floatStyles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: fieldCount === 0 ? 0.5 : 1,
                },
              ]}
              onPress={() => {
                toggleExpanded();
                onSave();
              }}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              disabled={fieldCount === 0}
            >
              <Feather name="save" size={14} color="#fff" />
              <Text style={floatStyles.saveBtnText}>Save Profile</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>

      {!expanded && (
        <Pressable
          onPress={toggleExpanded}
          style={floatStyles.badgeWrap}
          {...panResponder.panHandlers}
        >
          <Animated.View
            style={[
              floatStyles.badge,
              {
                backgroundColor:
                  fieldCount > 0 ? colors.primary : colors.indigoBg,
                borderColor: colors.indigoBorder,
                borderWidth: 1,
                transform: [{ scale: badgeScale }],
              },
            ]}
          >
            <Feather
              name="user"
              size={12}
              color={fieldCount > 0 ? '#fff' : colors.primary}
            />
            <Text
              style={[
                floatStyles.badgeText,
                { color: fieldCount > 0 ? '#fff' : colors.primary },
              ]}
            >
              {fieldCount > 0 ? `${fieldCount} collected` : 'Profile'}
            </Text>
            <View style={{ gap: 2, marginLeft: 2 }}>
              {[0, 1, 2].map(i => (
                <View
                  key={i}
                  style={{
                    width: 2,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor:
                      fieldCount > 0
                        ? 'rgba(255,255,255,0.6)'
                        : colors.textMuted,
                  }}
                />
              ))}
            </View>
          </Animated.View>
        </Pressable>
      )}
    </Animated.View>
  );
}

const floatStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    right: 12,
    width: 236,
    zIndex: 100,
    alignItems: 'flex-end',
  },
  panel: {
    width: 236,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    cursor: 'grab' as any,
  },
  headerDot: { width: 6, height: 6, borderRadius: 3 },
  panelTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.4,
  },
  fieldRow: { paddingVertical: 7, borderBottomWidth: 1 },
  fieldLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingVertical: 16,
    lineHeight: 18,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
  },
  saveBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  badgeWrap: { alignSelf: 'flex-end' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  badgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});

// ─── Profile field merger ─────────────────────────────────────────────────────
// The Edge Function often returns direct fields (displayName, currentDegree…)
// rather than a profileFields array.  This converts both into a unified
// profileFields list so the FloatingProfilePanel can display them.

const DIRECT_FIELD_MAP: Array<{ key: keyof ProfileSnapshot; label: string }> = [
  { key: 'displayName',        label: 'Full Name' },
  { key: 'currentDegree',      label: 'Degree' },
  { key: 'institution',        label: 'Institution' },
  { key: 'yearOfStudy',        label: 'Year of Study' },
  { key: 'skills',             label: 'Skills' },
  { key: 'city',               label: 'City' },
  { key: 'preferredIndustries',label: 'Preferred Industries' },
  { key: 'careerGoals',        label: 'Career Goals' },
  { key: 'portfolioUrl',       label: 'Portfolio / GitHub' },
];

function mergePartialProfile(
  incoming: Record<string, unknown>,
  existing: ProfileSnapshot,
): ProfileSnapshot {
  const pp = incoming as ProfileSnapshot;

  // Convert any populated direct fields into label/value rows
  const fromDirect = DIRECT_FIELD_MAP
    .filter(({ key }) => {
      const v = pp[key];
      return typeof v === 'string' && v.trim() !== '' && v !== 'You';
    })
    .map(({ key, label }) => ({ label, value: (pp[key] as string).trim() }));

  // Start from what the AI explicitly returned in profileFields
  const base: Array<{ label: string; value: string }> = Array.isArray(pp.profileFields)
    ? (pp.profileFields as Array<{ label: string; value: string }>)
    : [];

  // Keep existing snapshot fields so we never lose data between replies
  const prev = existing.profileFields ?? [];

  // Merge: base > fromDirect > prev (later entries only fill gaps)
  const merged: Array<{ label: string; value: string }> = [...base];
  for (const fd of [...fromDirect, ...prev]) {
    if (!merged.some(f => f.label.toLowerCase() === fd.label.toLowerCase())) {
      merged.push(fd);
    }
  }

  return {
    displayName:          pp.displayName        || existing.displayName,
    currentDegree:        pp.currentDegree      || existing.currentDegree,
    institution:          pp.institution        || existing.institution,
    yearOfStudy:          pp.yearOfStudy        || existing.yearOfStudy,
    skills:               pp.skills             || existing.skills,
    city:                 pp.city               || existing.city,
    preferredIndustries:  pp.preferredIndustries|| existing.preferredIndustries,
    careerGoals:          pp.careerGoals        || existing.careerGoals,
    portfolioUrl:         pp.portfolioUrl       || existing.portfolioUrl,
    profileFields:        merged,
  };
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, updateProfile, docs } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isLoadingFirst, setIsLoadingFirst] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [snapshot, setSnapshot] = useState<ProfileSnapshot>({
    profileFields: [],
  });
  const [editingIndex, setEditingIndex] = useState(-1);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const firstMessageFetched = useRef(false);

  const { isListening, toggleListening, supported: voiceSupported } =
    useVoiceInput(
      useCallback(
        (transcript: string) => {
          setInput(prev => (prev ? `${prev} ${transcript}` : transcript));
        },
        [],
      ),
    );

  const scrollToBottom = useCallback(() => {
    setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      120,
    );
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  // Build panel snapshot from existing profile on mount
  useEffect(() => {
    if (!profile) return;
    const fields: Array<{ label: string; value: string }> = [];
    if (profile.displayName && profile.displayName !== 'You')
      fields.push({ label: 'Full Name', value: profile.displayName });
    if (profile.currentDegree)
      fields.push({ label: 'Degree', value: profile.currentDegree });
    if (profile.institution)
      fields.push({ label: 'Institution', value: profile.institution });
    if (profile.yearOfStudy)
      fields.push({ label: 'Year of Study', value: profile.yearOfStudy });
    if (profile.skills)
      fields.push({ label: 'Skills', value: profile.skills });
    if (profile.city) fields.push({ label: 'City', value: profile.city });
    if (profile.preferredIndustries)
      fields.push({
        label: 'Preferred Industries',
        value: profile.preferredIndustries,
      });
    if (profile.careerGoals)
      fields.push({ label: 'Career Goals', value: profile.careerGoals });
    if (profile.portfolioUrl)
      fields.push({
        label: 'Portfolio / GitHub',
        value: profile.portfolioUrl,
      });
    if (profile.profileFields) {
      for (const pf of profile.profileFields) {
        if (!fields.some(f => f.label === pf.label))
          fields.push({ label: pf.label, value: pf.value });
      }
    }
    setSnapshot({
      displayName: profile.displayName,
      currentDegree: profile.currentDegree,
      institution: profile.institution,
      yearOfStudy: profile.yearOfStudy,
      skills: profile.skills,
      city: profile.city,
      preferredIndustries: profile.preferredIndustries,
      careerGoals: profile.careerGoals,
      portfolioUrl: profile.portfolioUrl,
      profileFields: fields,
    });
  }, [profile?.uid]);

  // Fetch the opening AI message.
  // previousHistory — pass saved messages when resuming a cut-off conversation.
  const fetchInitialMessage = useCallback(async (previousHistory?: ChatMessage[]) => {
    if (!profile) return;
    setIsLoadingFirst(true);
    setInitialError(null);

    const existingProfile = {
      displayName:
        profile.displayName !== 'You' ? profile.displayName : '',
      currentDegree: profile.currentDegree || '',
      institution: profile.institution || '',
      yearOfStudy: profile.yearOfStudy || '',
      skills: profile.skills || '',
      city: profile.city || '',
      preferredIndustries: profile.preferredIndustries || '',
      careerGoals: profile.careerGoals || '',
      portfolioUrl: profile.portfolioUrl || '',
      profileFields: profile.profileFields ?? [],
    };

    // Derive name from profileFields if displayName is still default
    const nameFromFields = (() => {
      const fields = profile.profileFields ?? [];
      const match = fields.find(f =>
        ['full name', 'name', 'first name'].some(kw => f.label.toLowerCase().includes(kw))
      );
      return match?.value?.trim() ?? '';
    })();

    const resolvedProfile = {
      ...existingProfile,
      displayName: existingProfile.displayName || nameFromFields,
    };

    // When resuming, pass the saved history so the AI continues from where it left off.
    // When starting fresh with profile data, pass an empty array — the existingProfile
    // field gives the AI enough context to skip fields it already knows.
    const messagesToSend = previousHistory ?? [];
    const resuming = messagesToSend.length > 0;

    try {
      const data = await aiService.profileChat({
        messages: messagesToSend,
        existingProfile: resolvedProfile,
        cvContent: getCvContent(docs),
        brief: true,
        conversational: true,
        resuming,
      });

      // Parse markers from response
      const { reply: cleanReply, profile: completeProfile } = extractProfileComplete(data.reply || '');
      const partialProfile = extractPartialProfile(data.reply || '') || data.partialProfile;

      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: cleanAiResponse(cleanMarkdown(
          cleanReply || (resuming
            ? "Welcome back! Let me know if you'd like to update anything."
            : "Hi! I'm Career Compass AI. What's your name?"),
        )),
      };

      // Append to existing history (if resuming) or start fresh
      const fullMessages = resuming
        ? [...messagesToSend, aiMsg]
        : [aiMsg];

      setMessages(fullMessages);
      AsyncStorage.setItem(CHAT_KEY, JSON.stringify(fullMessages)).catch(() => {});

      // Update profile from markers (complete overrides partial)
      if (completeProfile) {
        setSnapshot(prev => ({ ...prev, ...completeProfile }));
      } else if (partialProfile) {
        setSnapshot(prev => mergePartialProfile(partialProfile, prev));
      }
    } catch (err: any) {
      const errMsg: string = err?.message ?? 'Connection error';
      if (errMsg.includes('busy') || errMsg.includes('rate') || errMsg.includes('high demand')) {
        setInitialError('The AI is a bit busy right now. Tap "Retry" to try again.');
      } else {
        setInitialError("Couldn't reach the AI. Check your connection and tap Retry.");
      }
      // Keep existing messages if resuming; otherwise show fallback greeting
      if (!resuming) {
        const name = resolvedProfile.displayName;
        setMessages([{
          role: 'assistant',
          content: name
            ? `Welcome back, ${name}! I'm Career Compass AI. What would you like to update?`
            : "Hi! I'm Career Compass AI. Let's set up your profile — what's your full name?",
        }]);
      }
    } finally {
      setIsLoadingFirst(false);
    }
  }, [profile, docs]);

  useEffect(() => {
    if (!profile || firstMessageFetched.current) return;
    firstMessageFetched.current = true;

    AsyncStorage.getItem(CHAT_KEY)
      .then(raw => {
        if (raw) {
          const saved = JSON.parse(raw) as ChatMessage[];
          if (saved.length > 0) {
            // Always show the saved history immediately (no blank screen)
            setMessages(saved);
            const lastMsg = saved[saved.length - 1];
            if (lastMsg?.role === 'user') {
              // Conversation was cut off mid-reply — resume from here
              fetchInitialMessage(saved);
            } else {
              // History is complete — no API call needed, just show it
              setIsLoadingFirst(false);
            }
            return;
          }
        }
        // No history — start fresh (AI will use existingProfile to skip known fields)
        fetchInitialMessage();
      })
      .catch(() => fetchInitialMessage());
  }, [profile]);

  // Save profile data to context
  const saveProfile = useCallback(
    async (data: ProfileSnapshot) => {
      if (!profile) return;
      const rawFields: Array<{ label: string; value: string }> =
        data.profileFields ?? [];
      const profileFields = rawFields
        .filter(f => f.label?.trim() && f.value?.trim())
        .map((f, i) => ({
          id: `ai_${Date.now()}_${i}`,
          label: f.label.trim(),
          value: f.value.trim(),
        }));
      await updateProfile({
        ...profile,
        displayName: data.displayName || profile.displayName,
        currentDegree: data.currentDegree || profile.currentDegree,
        institution: data.institution || profile.institution,
        yearOfStudy: data.yearOfStudy || profile.yearOfStudy,
        skills: data.skills || profile.skills,
        city: data.city || profile.city,
        preferredIndustries:
          data.preferredIndustries || profile.preferredIndustries,
        careerGoals: data.careerGoals || profile.careerGoals,
        portfolioUrl: data.portfolioUrl || profile.portfolioUrl,
        profileFields:
          profileFields.length > 0
            ? profileFields
            : profile.profileFields,
      });
    },
    [profile, updateProfile],
  );

  const handleEditMessage = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setInput(messages[index].content);
      inputRef.current?.focus();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [messages],
  );

  const cancelEdit = useCallback(() => {
    setEditingIndex(-1);
    setInput('');
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking || isLoadingFirst) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg: ChatMessage = { role: 'user', content: text };
    const baseMessages =
      editingIndex >= 0 ? messages.slice(0, editingIndex) : messages;
    const updatedMessages = [...baseMessages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setEditingIndex(-1);
    setIsThinking(true);

    const existingProfile = profile
      ? {
          displayName:
            profile.displayName !== 'You' ? profile.displayName : '',
          currentDegree: profile.currentDegree || '',
          institution: profile.institution || '',
          yearOfStudy: profile.yearOfStudy || '',
          skills: profile.skills || '',
          city: profile.city || '',
          preferredIndustries: profile.preferredIndustries || '',
          careerGoals: profile.careerGoals || '',
          portfolioUrl: profile.portfolioUrl || '',
          profileFields: profile.profileFields ?? [],
        }
      : undefined;

    try {
      const data = await aiService.profileChat({
        messages: updatedMessages,
        existingProfile,
        cvContent: getCvContent(docs),
        brief: true,
        conversational: true,
      });

      // Parse markers from response
      const { reply: cleanReply, profile: completeProfile } = extractProfileComplete(data.reply || '');
      const partialProfile = extractPartialProfile(data.reply || '') || data.partialProfile;

      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: cleanAiResponse(cleanMarkdown(
          cleanReply || "I'm having trouble — please try again.",
        )),
      };
      const fullHistory = [...updatedMessages, aiMsg];
      setMessages(fullHistory);
      AsyncStorage.setItem(CHAT_KEY, JSON.stringify(fullHistory)).catch(() => {});

      // Update profile from markers (complete overrides partial)
      if (completeProfile) {
        setSnapshot(prev => ({ ...prev, ...completeProfile }));
      } else if (partialProfile) {
        setSnapshot(prev => {
          const merged = mergePartialProfile(partialProfile, prev);
          // Immediately persist partial data so the profile tab stays in sync
          if (profile && merged.profileFields && merged.profileFields.length > 0) {
            const existingFieldsById = new Map(
              (profile.profileFields ?? []).map(f => [f.label.toLowerCase(), f.id])
            );
            const profileFields = merged.profileFields
              .filter(f => f.label?.trim() && f.value?.trim())
              .map((f, i) => ({
                id: existingFieldsById.get(f.label.toLowerCase()) ?? `ai_${Date.now()}_${i}`,
                label: f.label.trim(),
                value: f.value.trim(),
              }));
            updateProfile({
              ...profile,
              displayName:
                merged.displayName && merged.displayName !== 'You'
                  ? merged.displayName
                  : profile.displayName,
              currentDegree:       merged.currentDegree       || profile.currentDegree,
              institution:         merged.institution         || profile.institution,
              yearOfStudy:         merged.yearOfStudy         || profile.yearOfStudy,
              skills:              merged.skills              || profile.skills,
              city:                merged.city                || profile.city,
              preferredIndustries: merged.preferredIndustries || profile.preferredIndustries,
              careerGoals:         merged.careerGoals         || profile.careerGoals,
              portfolioUrl:        merged.portfolioUrl        || profile.portfolioUrl,
              profileFields:
                profileFields.length > 0 ? profileFields : (profile.profileFields ?? []),
            }).catch(() => {});
          }
          return merged;
        });
      }
          }
          return merged;
        });
      }
      
      // Chat continues indefinitely - user clicks "Continue to Career Campus" when ready
    } catch (err: any) {
      const errMsg: string = err?.message ?? '';
      const isRateLimit =
        errMsg.includes('busy') ||
        errMsg.includes('rate') ||
        errMsg.includes('high demand');
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: isRateLimit
            ? "I'm a bit busy right now — please send your message again in a moment."
            : "I couldn't process that. Please check your connection and try again.",
        },
      ]);
    } finally {
      setIsThinking(false);
      inputRef.current?.focus();
    }
  }, [
    input,
    isThinking,
    isLoadingFirst,
    messages,
    editingIndex,
    profile,
    docs,
    saveProfile,
  ]);

  const handleManualSave = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveProfile(snapshot);
    router.replace('/(tabs)');
  }, [snapshot, saveProfile, router]);

  const handleSkip = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 16 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 16 : insets.bottom;

  return (
    <View style={[s.screen, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerCenter}>
          <View
            style={[
              s.aiDot,
              {
                backgroundColor: isLoadingFirst
                  ? colors.textMuted
                  : colors.success,
              },
            ]}
          />
          <Text style={s.headerTitle}>Career Compass AI</Text>
        </View>
        <Pressable
          onPress={handleSkip}
          style={s.skipBtn}
          accessibilityLabel="Skip setup"
        >
          <Text style={s.skipText}>Skip</Text>
        </Pressable>
      </View>

      {/* Chat + floating panel */}
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={s.chatArea}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 20,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        >
          {/* First-message loading state */}
          {isLoadingFirst && (
            <View
              style={{ alignSelf: 'flex-start', marginBottom: 12 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 5,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 10, color: '#fff' }}>✦</Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: 'Inter_600SemiBold',
                    color: colors.primary,
                    letterSpacing: 0.5,
                  }}
                >
                  CAREER COMPASS AI
                </Text>
              </View>
              <View style={s.thinkingBubble}>
                <TypingDots colors={colors} />
              </View>
            </View>
          )}

          {/* Initial load error banner */}
          {initialError && !isLoadingFirst && (
            <View style={s.errorBanner}>
              <Feather
                name="alert-circle"
                size={14}
                color={colors.warning}
              />
              <Text style={[s.errorBannerText, { color: colors.textSecondary }]}>
                {initialError}
              </Text>
              <Pressable
                onPress={() => {
                  firstMessageFetched.current = false;
                  setMessages([]);
                  fetchInitialMessage();
                  firstMessageFetched.current = true;
                }}
                style={s.retryPill}
              >
                <Feather name="refresh-cw" size={11} color={colors.primary} />
                <Text style={[s.retryPillText, { color: colors.primary }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          )}

          {messages.map((msg, i) => {
            const isLastUser =
              msg.role === 'user' &&
              !messages.slice(i + 1).some(m => m.role === 'user');
            return (
              <MessageBubble
                key={i}
                msg={msg}
                colors={colors}
                index={i}
                isLastUser={isLastUser}
                onEdit={() => handleEditMessage(i)}
              />
            );
          })}

          {isThinking && !isLoadingFirst && (
            <Animated.View
              style={{ alignSelf: 'flex-start', marginBottom: 12 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 5,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 10, color: '#fff' }}>✦</Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: 'Inter_600SemiBold',
                    color: colors.primary,
                    letterSpacing: 0.5,
                  }}
                >
                  CAREER COMPASS AI
                </Text>
              </View>
              <View style={s.thinkingBubble}>
                <TypingDots colors={colors} />
              </View>
            </Animated.View>
          )}
        </ScrollView>

        <FloatingProfilePanel
          snapshot={snapshot}
          onSave={handleManualSave}
          colors={colors}
        />
      </View>

      {/* Input area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={topPad}
      >
        <View style={[s.inputArea, { paddingBottom: bottomPad + 12 }]}>
          {editingIndex >= 0 && (
            <View
              style={[
                s.editingChip,
                {
                  backgroundColor: colors.indigoBg,
                  borderColor: colors.indigoBorder,
                },
              ]}
            >
              <Feather name="edit-2" size={11} color={colors.primary} />
              <Text
                style={[
                  s.editingChipText,
                  { color: colors.primary },
                ]}
              >
                Editing message
              </Text>
              <Pressable onPress={cancelEdit} hitSlop={8}>
                <Feather
                  name="x"
                  size={13}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          )}
          <View style={s.inputRow}>
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                placeholder={
                  editingIndex >= 0
                    ? 'Edit your message…'
                    : 'Type your answer…'
                }
                placeholderTextColor={colors.textMuted}
                style={s.textInput}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                editable={!isThinking && !isLoadingFirst}
                accessibilityLabel="Chat input"
              />
              {voiceSupported && (
                <Pressable
                  style={[
                    s.micBtn,
                    isListening && s.micBtnActive,
                  ]}
                  onPress={toggleListening}
                  accessibilityLabel={
                    isListening ? 'Stop listening' : 'Speak your answer'
                  }
                >
                  <Feather
                    name={isListening ? 'mic-off' : 'mic'}
                    size={18}
                    color={isListening ? '#fff' : colors.textMuted}
                  />
                </Pressable>
              )}
              <Pressable
                style={[
                  s.sendBtn,
                  (!input.trim() || isThinking || isLoadingFirst) &&
                    s.sendBtnDisabled,
                ]}
                onPress={handleSend}
                disabled={!input.trim() || isThinking || isLoadingFirst}
                accessibilityLabel="Send message"
                android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
              >
                {isThinking ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Feather
                    name="send"
                    size={18}
                    color={
                      !input.trim() || isLoadingFirst
                        ? colors.textMuted
                        : '#fff'
                    }
                  />
                )}
              </Pressable>
            </View>
            {voiceSupported && isListening && (
              <Text style={s.listeningHint}>Listening… speak now</Text>
            )}
          </View>
        </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      position: 'relative',
    },
    headerCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    aiDot: { width: 8, height: 8, borderRadius: 4 },
    headerTitle: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      color: colors.text,
      letterSpacing: -0.3,
    },
    skipBtn: {
      position: 'absolute',
      right: 20,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    skipText: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.textMuted,
    },
    chatArea: { flex: 1 },
    thinkingBubble: {
      backgroundColor: 'rgba(99,102,241,0.1)',
      borderColor: 'rgba(99,102,241,0.25)',
      borderWidth: 1,
      borderRadius: 18,
      borderTopLeftRadius: 4,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.warningBg,
      borderColor: colors.warningBorder,
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
      marginBottom: 16,
    },
    errorBannerText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    retryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.indigoBg,
      borderColor: colors.indigoBorder,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    retryPillText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
    doneCard: {
      alignItems: 'center',
      padding: 28,
      marginTop: 8,
      backgroundColor: 'rgba(16,185,129,0.08)',
      borderColor: 'rgba(16,185,129,0.25)',
      borderWidth: 1,
      borderRadius: 20,
    },
    doneIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(16,185,129,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    doneTitle: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: colors.text,
      marginBottom: 6,
    },
    doneSub: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 22,
    },
    continueBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 24,
    },
    continueBtnText: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
      color: '#fff',
    },
    inputArea: {
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    textInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.text,
    },
    micBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderWidth: 1,
      borderColor: colors.border,
    },
    micBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sendBtnDisabled: {
      backgroundColor: 'rgba(255,255,255,0.07)',
    },
    listeningHint: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.primary,
      textAlign: 'center',
      marginTop: 6,
    },
    editingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 8,
      alignSelf: 'flex-start',
    },
    editingChipText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      flex: 1,
    },
  });
