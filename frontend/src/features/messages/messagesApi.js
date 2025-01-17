import { apiSlice } from "../api/apiSlice";
import { io } from "socket.io-client";
export const messagesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMessages: builder.query({
      query: (id) =>
        `/messages?conversationId=${id}&_sort=timestamp&_order=desc&_page=1&_limit=${
          import.meta.env.VITE_APP_MESSAGES_PER_PAGE
        }`,
      async onCacheEntryAdded(
        arg,
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved }
      ) {
        const socket = io("http://localhost:9000", {
          reconnectionDelay: 1000,
          reconnection: true,
          transports: ["websocket"],
        });

        try {
          await cacheDataLoaded;

          socket.on("message", (data) => {
            updateCachedData((draft) => {
              const exists = draft.some(
                (message) => message.id === data?.data?.id
              );

              // Add the new message only if it doesn't exist
              if (!exists && data?.data?.conversationId == arg) {
                draft.unshift(data.data);
              }
            });
          });
        } catch (err) {
          console.error("Error updating message cache:", err);
        }

        await cacheEntryRemoved;
        socket.close();
      },
    }),
    addMessage: builder.mutation({
      query: (data) => ({
        url: "/messages",
        method: "POST",
        body: data,
      }),
    }),
  }),
});

export const { useGetMessagesQuery, useAddMessageMutation } = messagesApi;
