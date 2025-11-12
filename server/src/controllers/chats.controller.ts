import type { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { firestore } from '../config/firebase';

const chatsCollection = firestore.collection('chats');

const createChatSchema = z.object({
  requestId: z.string().min(1),
  participantId: z.string().min(1)
});

const sendMessageSchema = z.object({
  text: z.string().min(1).max(2000)
});

function serializeTimestamp(value?: Timestamp | null) {
  if (!value) return null;
  return value.toMillis();
}

export async function getOrCreateChatHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = createChatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parsed.error.flatten() });
  }

  const { requestId, participantId } = parsed.data;
  const participants = Array.from(new Set([req.user.uid, participantId])).sort();
  const chatId = requestId;

  try {
    const chatRef = chatsCollection.doc(chatId);
    await chatRef.set(
      {
        requestId,
        participants,
        createdAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const snapshot = await chatRef.get();
    const data = snapshot.data();
    return res.json({
      id: snapshot.id,
      requestId: data?.requestId,
      participants: data?.participants ?? participants,
      createdAt: serializeTimestamp(data?.createdAt)
    });
  } catch (error) {
    console.error('[chats] getOrCreate failed', error);
    return res.status(500).json({ message: 'Failed to create chat' });
  }
}

export async function listMessagesHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const paramsSchema = z.object({ chatId: z.string().min(1) });
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid chat id' });
  }

  const chatId = parsed.data.chatId;
  const chatRef = chatsCollection.doc(chatId);

  try {
    const chatSnapshot = await chatRef.get();
    if (!chatSnapshot.exists) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    const chatData = chatSnapshot.data();
    if (!chatData?.participants?.includes(req.user.uid)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const messagesSnapshot = await chatRef
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .orderBy('__name__', 'asc')
      .limit(500)
      .get();

    const items = messagesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        chatId,
        senderId: data.senderId,
        text: data.text,
        createdAt: serializeTimestamp(data.createdAt)
      };
    });

    return res.json({ items });
  } catch (error) {
    console.error('[chats] list messages failed', error);
    return res.status(500).json({ message: 'Failed to fetch messages' });
  }
}

export async function sendMessageHandler(req: Request, res: Response) {
  if (!req.user?.uid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const paramsSchema = z.object({ chatId: z.string().min(1) });
  const parsedParams = paramsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ message: 'Invalid chat id' });
  }

  const parsedBody = sendMessageSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ message: 'Invalid body', errors: parsedBody.error.flatten() });
  }

  const chatId = parsedParams.data.chatId;
  const { text } = parsedBody.data;

  try {
    const chatRef = chatsCollection.doc(chatId);
    const chatSnapshot = await chatRef.get();
    if (!chatSnapshot.exists) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    const chatData = chatSnapshot.data();
    if (!chatData?.participants?.includes(req.user.uid)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const messageRef = await chatRef.collection('messages').add({
      senderId: req.user.uid,
      text,
      createdAt: FieldValue.serverTimestamp()
    });

    const messageSnapshot = await messageRef.get();
    const messageData = messageSnapshot.data();
    return res.status(201).json({
      id: messageSnapshot.id,
      chatId,
      senderId: messageData?.senderId,
      text: messageData?.text,
      createdAt: serializeTimestamp(messageData?.createdAt)
    });
  } catch (error) {
    console.error('[chats] send message failed', error);
    return res.status(500).json({ message: 'Failed to send message' });
  }
}

