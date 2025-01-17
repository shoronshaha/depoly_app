import { useSelector } from "react-redux";
import Message from "./Message";

export default function Messages({ messages = [] }) {
  const { user } = useSelector((state) => state.auth) || {};
  const { email } = user || {};

  // Ensure messages are unique based on the message id
  const uniqueMessages = messages.reduce((acc, message) => {
    if (!acc.some((m) => m.id === message.id)) {
      acc.push(message);
    }
    return acc;
  }, []);

  return (
    <>
      <div className="relative w-full h-[calc(100vh_-_197px)] p-6 overflow-y-auto flex flex-col-reverse">
        <ul className="space-y-2">
          {uniqueMessages
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp) // Sort messages by timestamp
            .map((message) => {
              const { message: lastMessage, id, sender } = message || {};
              const justify = sender.email !== email ? "start" : "end";

              // Ensure lastMessage is a string (not an object)
              const messageToDisplay =
                typeof lastMessage === "object"
                  ? JSON.stringify(lastMessage) // Convert object to string
                  : lastMessage;

              return (
                <Message
                  key={id}
                  justify={justify}
                  message={messageToDisplay}
                />
              );
            })}
        </ul>
      </div>
    </>
  );
}
