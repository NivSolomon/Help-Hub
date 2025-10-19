import { useEffect, useRef, useState } from "react";
import { listenMessages, sendMessage } from "../lib/chat";
import { auth } from "../lib/firebase";

type Props = { chatId: string; onClose: () => void };

export default function ChatPanel({ chatId, onClose }: Props) {
  const [msgs, setMsgs] = useState<{id:string;senderId:string;text:string}[]>([]);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const me = auth.currentUser?.uid;

  useEffect(() => {
    const off = listenMessages(chatId, setMsgs);
    return () => off();
  }, [chatId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send() {
    if (!me || !text.trim()) return;
    await sendMessage(chatId, me, text.trim());
    setText("");
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 w-full max-w-md rounded-t-2xl border bg-white shadow-xl">
      <div className="flex items-center justify-between border-b p-3">
        <div className="font-semibold">Chat</div>
        <button onClick={onClose} className="rounded border px-2 py-1 text-sm">Close</button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto p-3 space-y-2">
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.senderId === me ? "justify-end" : "justify-start"}`}>
            <div className={`rounded-2xl px-3 py-2 text-sm ${m.senderId===me?"bg-black text-white":"bg-gray-100"}`}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 p-3 border-t">
        <input
          className="flex-1 rounded-lg border p-2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          onKeyDown={(e)=> e.key==="Enter" && send()}
        />
        <button onClick={send} className="rounded-lg bg-black px-4 py-2 text-white">Send</button>
      </div>
    </div>
  );
}
