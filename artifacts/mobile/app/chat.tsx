import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Keyboard, KeyboardEvent } from 'react-native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { genId } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { aiService, HybridResponse } from '@/lib/aiService';
import { useApp } from '@/context/AppContext';

// Import AsyncStorage at the bottom
let AsyncStorage: any;

export default function ChatScreen() {
  const colors = useColors();
  const { profile } = useApp();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboardRef = useRef<KeyboardEvent | null>(null);

  // Load chat history from local storage on mount
  useEffect(() => {
    loadChatHistory();
  }, []);

  // Save chat history to local storage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory();
    }
  }, [messages]);

  const loadChatHistory = async () => {
    try {
      if (!AsyncStorage) {
        AsyncStorage = await import('@react-native-async-storage/async-storage');
      }
      const stored = await AsyncStorage.getItem('cc_chat_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(parsed);
      }
    } catch (err: any) {
      console.warn('[ChatScreen] Failed to load chat history:', err.message);
    }
  };

  const saveChatHistory = async () => {
    try {
      if (!AsyncStorage) {
        AsyncStorage = await import('@react-native-async-storage/async-storage');
      }
      await AsyncStorage.setItem('cc_chat_history', JSON.stringify(messages));
    } catch (err: any) {
      console.warn('[ChatScreen] Failed to save chat history:', err.message);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    if (isLoading) return;

    const userMessage = inputText.trim();
    setIsLoading(true);
    setError(null);

    try {
      // Use hybridChat for better responses with embeddings
      const response = await aiService.hybridChat(userMessage);
      const reply = response.reply || 'I\'m sorry, I couldn\'t generate a response at the moment.';
      
      const newMessage: ChatMessage = {
        id: genId(),
        text: userMessage,
        isUser: true,
        timestamp: new Date().toISOString(),
        hasEmbedding: response.embedding !== undefined,
      };

      const aiMessage: ChatMessage = {
        id: genId(),
        text: reply,
        isUser: false,
        timestamp: new Date().toISOString(),
        hasEmbedding: response.embedding !== undefined,
        model: response.text_model,
      };

      setMessages(prev => [...prev, newMessage, aiMessage]);
      setInputText('');
    } catch (err: any) {
      console.error('[ChatScreen] AI service error:', err);
      const userMessage = inputText.trim();
      const newMessage: ChatMessage = {
        id: genId(),
        text: userMessage,
        isUser: true,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, newMessage]);
      setInputText('');
      
      // Show user-friendly error
      if (err.message.includes('rate limit') || err.message.includes('429')) {
        setError('AI is currently busy. Please try again in a few minutes.');
      } else if (err.message.includes('network') || err.message.includes('Connection')) {
        setError('Network error. Please check your internet connection.');
      } else {
        setError('Failed to get AI response. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPress = useCallback(() => {
    handleSend();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [inputText, isLoading]);

  const handleKeyPress = useCallback((e: any) => {
    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [inputText, isLoading]);

  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  const renderMessage = useCallback((message: ChatMessage, index: number) => {
    const isUser = message.isUser;
    
    if (isUser) {
      return (
        <View key={message.id} style={styles.messageRow}>
          <Pressable
            style={styles.userMessage}
            onLongPress={() => handleDeleteMessage(message.id)}
            android_ripple={{ color: colors.card, borderless: true }}
            accessibilityLabel="Delete message"
          >
            <Text style={styles.userText}>{message.text}</Text>
          </Pressable>
        </View>
      );
    } else {
      // AI message
      return (
        <View key={message.id} style={styles.messageRow}>
          <View style={styles.aiMessage}>
            <Text style={styles.aiText}>{message.text}</Text>
            {message.model && (
              <Text style={styles.modelInfo}>
                {message.model === 'gemini-2.5-flash' ? '✨ Gemini 2.5 Flash' : message.model}
              </Text>
            )}
          </View>
        </View>
      );
    }
  }, [colors, handleDeleteMessage]);

  const messagesContainerRef = useRef<View>(null);
  const scrollToBottom = useCallback(() => {
    messagesContainerRef.current?.scrollToEnd({ animated: true });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return (
    <KeyboardAvoidView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      behavior="padding"
      keyboardVerticalOffset={20}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Career Compass AI</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Messages List */}
      <View style={styles.messagesContainer} ref={messagesContainerRef}>
        {error && (
          <View style={[styles.error, { backgroundColor: colors.dangerBg }]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => setError(null)}
              style={[styles.closeError, { backgroundColor: colors.danger }]}
            >
              <Feather name="x" size={14} color="#fff" />
            </Pressable>
          </View>
        )}
        {messages.map(renderMessage)}
        {isLoading && (
          <View style={styles.loadingIndicator}>
            <Feather name="more-horizontal" size={20} color={colors.textMuted} />
          </View>
        )}
      </View>

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your message..."
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleSendPress}
            onKeyPress={handleKeyPress}
            multiline
            textAlignVertical="center"
            enablesReturnKeyAutomatically
            returnKeyType="send"
            blurOnSubmit={false}
            maxLength={500}
          />
        </View>
        <Pressable
          onPress={handleSendPress}
          style={[styles.sendButton, { backgroundColor: colors.primary }]}
          disabled={isLoading || !inputText.trim()}
          android_ripple={{ color: colors.primaryLight }}
          accessibilityLabel="Send message"
        >
          <Feather name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidView>
  );
}

type ChatMessage = {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
  hasEmbedding?: boolean;
  model?: string;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  messageRow: {
    marginBottom: 16,
  },
  userMessage: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '85%',
    alignSelf: 'right',
  },
  userText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.primaryFg,
  },
  aiMessage: {
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '85%',
    alignSelf: 'left',
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    lineHeight: 20,
  },
  modelInfo: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: colors.primary,
    marginTop: 6,
    alignSelf: 'right',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: colors.primaryLight,
  },
  loadingIndicator: {
    alignSelf: 'left',
    borderRadius: 18,
    padding: 12,
    marginTop: 8,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'web' ? 16 : 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
  },
  input: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.text,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  error: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '85%',
    alignSelf: 'left',
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#fff',
  },
  closeError: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});