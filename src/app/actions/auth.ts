"use server";

import { createClient } from "@/lib/supabase/server";

export async function loginAction(email: string, password: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "E-mail ou senha inválidos"
          : error.message,
    };
  }

  // Retorna success — o cliente faz window.location.href depois que os cookies estão setados
  return { success: true };
}

export async function registerAction(
  email: string,
  password: string,
  name: string
) {
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name, name } },
  });

  if (error) {
    return {
      error:
        error.message === "User already registered"
          ? "E-mail já cadastrado. Tente fazer login."
          : error.message,
    };
  }

  return { success: true };
}
