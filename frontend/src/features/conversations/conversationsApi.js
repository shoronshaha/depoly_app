import io from "socket.io-client";
import { apiSlice } from "../api/apiSlice";
import { messagesApi } from "../messages/messagesApi";

export const conversationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getConversations: builder.query({
      query: (email) =>
        `/conversations?participants_like=${email}&_sort=timestamp&_order=desc&_page=1&_limit=${
          import.meta.env.VITE_APP_CONVERSATIONS_PER_PAGE
        }`,
      transformResponse(apiResponse, meta) {
        const totalCount = meta.response.headers.get("X-Total-Count");
        return {
          data: apiResponse,
          totalCount,
        };
      },
      async onCacheEntryAdded(
        arg,
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved }
      ) {
        // create socket
        const socket = io(`${import.meta.env.VITE_APP_API_URL}`, {
          reconnectionDelay: 1000,
          reconnection: true,
          reconnectionAttempts: 10,
          transports: ["websocket"],
          agent: false,
          upgrade: false,
          rejectUnauthorized: false,
        });

        try {
          await cacheDataLoaded;
          socket.on("conversation", (data) => {
            console.log(data);

            // Update only if the logged-in user is part of the conversation
            updateCachedData((draft) => {
              const isParticipant = data?.data?.users?.some(
                (user) => user.email === arg
              );

              if (isParticipant) {
                const conversation = draft.data.find(
                  (c) => c.id == data?.data?.id
                );

                if (conversation?.id) {
                  // Update existing conversation
                  conversation.message = data?.data?.message;
                  conversation.timestamp = data?.data?.timestamp;
                } else {
                  // Add the new conversation for the specific user
                  draft.data.unshift(data?.data);
                  draft.totalCount += 1; // Increase totalCount instead of decreasing
                }
              }
            });
          });
        } catch (err) {}

        await cacheEntryRemoved;
        socket.close();
      },
    }),
    getMoreConversations: builder.query({
      query: ({ email, page }) =>
        `/conversations?participants_like=${email}&_sort=timestamp&_order=desc&_page=${page}&_limit=${
          import.meta.env.VITE_APP_CONVERSATIONS_PER_PAGE
        }`,
      async onQueryStarted({ email }, { queryFulfilled, dispatch }) {
        try {
          const conversations = await queryFulfilled;
          if (conversations?.data?.length > 0) {
            // update conversation cache pessimistically start
            dispatch(
              apiSlice.util.updateQueryData(
                "getConversations",
                email,
                (draft) => {
                  return {
                    data: [...draft.data, ...conversations.data],
                    totalCount: Number(draft.totalCount),
                  };
                }
              )
            );
            // update messages cache pessimistically end
          }
        } catch (err) {}
      },
    }),
    getConversation: builder.query({
      query: ({ userEmail, participantEmail }) =>
        `/conversations?participants_like=${userEmail}-${participantEmail}&&participants_like=${participantEmail}-${userEmail}`,
    }),
    addConversation: builder.mutation({
      query: ({ sender, data }) => ({
        url: "/conversations",
        method: "POST",
        body: data,
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        // Generate a temporary ID for optimistic entry
        const temporaryId = Date.now();

        // Optimistic cache update start
        const pathResult = dispatch(
          apiSlice.util.updateQueryData(
            "getConversations",
            arg.sender,
            (draft) => {
              // Check if the conversation already exists in the cache
              const exists = draft.data.some(
                (c) =>
                  c.users.some(
                    (user) => user.email === arg.data.users[0].email
                  ) &&
                  c.users.some((user) => user.email === arg.data.users[1].email)
              );

              if (!exists) {
                // Add the new conversation optimistically
                draft.data.unshift({
                  id: temporaryId, // Temporary ID
                  users: arg.data.users,
                  message: arg.data.message,
                  timestamp: arg.data.timestamp,
                });
                draft.totalCount += 1;
              }
            }
          )
        );
        // Optimistic cache update end

        try {
          const conversation = await queryFulfilled;

          if (conversation?.data?.id) {
            // Update conversations cache with the actual conversation
            dispatch(
              apiSlice.util.updateQueryData(
                "getConversations",
                arg.sender,
                (draft) => {
                  // Remove the optimistic entry with the temporary ID
                  draft.data = draft.data.filter((c) => c.id !== temporaryId);

                  // Add the actual conversation data
                  draft.data.unshift(conversation.data);
                }
              )
            );

            // Silent entry to message table (add message entry)
            const users = arg.data.users;
            const senderUser = users.find((user) => user.email === arg.sender);
            const receiverUser = users.find(
              (user) => user.email !== arg.sender
            );

            const res = await dispatch(
              messagesApi.endpoints.addMessage.initiate({
                conversationId: conversation?.data?.id,
                sender: senderUser,
                receiver: receiverUser,
                message: arg.data.message,
                timestamp: arg.data.timestamp,
              })
            ).unwrap();

            // Update messages cache pessimistically
            dispatch(
              apiSlice.util.updateQueryData(
                "getMessages",
                res.conversationId.toString(),
                (draft) => {
                  draft.push(res);
                }
              )
            );
          }
        } catch (err) {
          // Rollback optimistic cache update if request fails
          pathResult.undo();
          console.error("Error while adding conversation:", err);
        }
      },
    }),

    editConversation: builder.mutation({
      query: ({ id, data, sender }) => ({
        url: `/conversations/${id}`,
        method: "PATCH",
        body: data,
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        // optimistic cache update start
        const pathResult = dispatch(
          apiSlice.util.updateQueryData(
            "getConversations",
            arg.sender,
            (draft) => {
              const draftConversation = draft.data.find((c) => c.id == arg.id);
              draftConversation.message = arg.data.message;
              draftConversation.timestamp = arg.data.timestamp;

              // Move this conversation to the top of the list (after editing)
              draft.data = draft.data.filter((c) => c.id !== arg.id);
              draft.data.unshift(draftConversation); // Place it at the top
            }
          )
        );
        // optimistic cache update end

        try {
          const conversation = await queryFulfilled;
          if (conversation?.data?.id) {
            // silent entry to message table
            const users = arg.data.users;
            const senderUser = users.find((user) => user.email === arg.sender);
            const receiverUser = users.find(
              (user) => user.email !== arg.sender
            );

            const res = await dispatch(
              messagesApi.endpoints.addMessage.initiate({
                conversationId: conversation?.data?.id,
                sender: senderUser,
                receiver: receiverUser,
                message: arg.data.message,
                timestamp: arg.data.timestamp,
              })
            ).unwrap();

            // update messages cache pessimistically start
            dispatch(
              apiSlice.util.updateQueryData(
                "getMessages",
                res.conversationId.toString(),
                (draft) => {
                  draft.push(res);
                }
              )
            );
            // update messages cache pessimistically end
          }
        } catch (err) {
          pathResult.undo();
        }
      },
    }),
  }),
});

export const {
  useGetConversationsQuery,
  useGetConversationQuery,
  useAddConversationMutation,
  useEditConversationMutation,
} = conversationsApi;
