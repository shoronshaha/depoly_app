import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { userLoggedIn } from "../auth/authSlice";

export default function useAuthCheck() {
  const dispatch = useDispatch();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    try {
      const localAuth = localStorage.getItem("auth");
      if (localAuth) {
        const auth = JSON.parse(localAuth);
        if (auth?.accessToken && auth?.user) {
          dispatch(userLoggedIn(auth));
        }
      }
    } catch (error) {
      console.error("Failed to parse auth data:", error);
    } finally {
      setAuthChecked(true);
    }
  }, [dispatch]);

  return authChecked;
}
